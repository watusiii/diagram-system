// COLOR SCHEMES - Change activeScheme to switch colors
const COLOR_SCHEMES = {
    default: {
        background: 0xa6c8a9,
        spine: 0x333333,
        timeLabel: 0x333333,
        taskBorder: 0x000000,
        taskText: 0x222222,
        containerBorder: 0x333333,
        labelText: 0x000000,
        labelAlpha: 0.7,
        blendMode: 'MULTIPLY',
        intersectionColor: 0x000000,
        intersectionAlpha: 0.15
    },
    dark: {
        background: 0x2a2a2a,
        spine: 0xffffff,
        timeLabel: 0xffffff,
        taskBorder: 0xffffff,
        taskText: 0xeeeeee,
        containerBorder: 0xffffff,
        labelText: 0xffffff,
        labelAlpha: 0.9,
        blendMode: 'MULTIPLY',
        intersectionColor: 0xffffff,
        intersectionAlpha: 0.2
    },
    blueprint: {
        background: 0x0d47a1,
        spine: 0xffffff,
        timeLabel: 0xffffff,
        taskBorder: 0xffffff,
        taskText: 0xffffff,
        containerBorder: 0xffffff,
        labelText: 0xffffff,
        labelAlpha: 0.9,
        blendMode: 'MULTIPLY',
        intersectionColor: 0xffffff,
        intersectionAlpha: 0.25
    },
    primary: {
        background: 0xffffff,
        spine: 0x000000,
        timeLabel: 0x000000,
        taskBorder: 0x000000,
        taskText: 0x000000,
        containerBorder: 0x000000,
        labelText: 0x000000,
        labelAlpha: 1.0,
        blendMode: 'NORMAL',
        intersectionColor: 0x000000,
        intersectionAlpha: 0.1,
        overrideContainers: true,
        containerColors: [
            { color: 0xff0000, alpha: 1.0 }, // Red
            { color: 0x0000ff, alpha: 1.0 }, // Blue
            { color: 0xffff00, alpha: 1.0 }, // Yellow
            { color: 0x00ff00, alpha: 1.0 }  // Green
        ]
    }
};

const ACTIVE_SCHEME = 'blueprint'; // Change this to switch color schemes

class DiagramRenderer {
    constructor(data, app) {
        this.data = data;
        this.settings = data.settings;
        this.app = app;
        this.container = new PIXI.Container();
        app.stage.addChild(this.container);
        this.containerEdges = []; // Track all container edges for collision detection

        // Apply color scheme
        this.colors = COLOR_SCHEMES[ACTIVE_SCHEME];
        this.containerColorIndex = 0; // Track which primary color to use next

        // Containers for dynamic elements (layer order matters)
        this.disciplinesContainer = new PIXI.Container();
        this.phasesContainer = new PIXI.Container();
        this.intersectionsContainer = new PIXI.Container();
        this.bordersContainer = new PIXI.Container();
        this.labelsContainer = new PIXI.Container();

        this.container.addChild(this.disciplinesContainer);
        this.container.addChild(this.phasesContainer);
        this.container.addChild(this.intersectionsContainer); // Overlaps on top
        this.container.addChild(this.bordersContainer); // Borders after intersections
        this.container.addChild(this.labelsContainer); // Labels on top

        // Animation state
        this.animationProgress = 0; // 0 to 1
        this.animationDuration = 1500; // Total animation time in ms (lower = faster)
        this.taskAnimDuration = 350; // Task grow time in ms (lower = faster)
        this.startTime = null;
        this.spineGraphics = null;
        this.arrowGraphics = null;
        this.timeLabel = null;
        this.taskElements = []; // Store task graphics and text for animation
        this.currentArrowY = 0; // Current Y position of arrow tip
        this.taskTriggerOffset = 40; // Arrow must be this far past task Y before task starts
        this.disciplineAnimProgress = {}; // Track animation progress per discipline
        this.phaseAnimProgress = {}; // Track animation progress per phase
    }

    indexToY(index) {
        return this.settings.topPadding + (index * this.settings.stepHeight);
    }

    // Calculate maximum Y extent of all elements (tasks, phases, disciplines)
    calculateMaxEndY() {
        let maxEndY = this.indexToY(this.data.tasks.length);

        // Check disciplines with extendBeyondTasks
        Object.keys(this.data.disciplines).forEach(disciplineId => {
            const discipline = this.data.disciplines[disciplineId];
            if (discipline.extendBeyondTasks && this.settings.extraTimeSteps) {
                // Find last task index for this discipline
                const disciplineTaskIndices = [];
                this.data.tasks.forEach((task, index) => {
                    if (task.disciplines && task.disciplines.includes(disciplineId)) {
                        disciplineTaskIndices.push(index);
                    }
                });
                if (disciplineTaskIndices.length > 0) {
                    const maxIndex = Math.max(...disciplineTaskIndices);
                    const disciplineEndY = this.indexToY(maxIndex + 1) + (this.settings.extraTimeSteps * this.settings.stepHeight);
                    maxEndY = Math.max(maxEndY, disciplineEndY);
                }
            }
        });

        return maxEndY;
    }

    hexToNumber(rgba) {
        const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const a = match[4] ? parseFloat(match[4]) : 1;
            return { color: (r << 16) + (g << 8) + b, alpha: a };
        }
        return { color: 0xffffff, alpha: 1 };
    }

    // Get container color (override with primary colors if enabled)
    getContainerColor(originalColor) {
        if (this.colors.overrideContainers && this.colors.containerColors) {
            const colorData = this.colors.containerColors[this.containerColorIndex % this.colors.containerColors.length];
            this.containerColorIndex++;
            return colorData;
        }
        return this.hexToNumber(originalColor);
    }

    // Calculate safe text size and corner radius
    getSafeTextAndRadius(textLabel, containerHeight, maxRadius, baseFontSize = 11) {
        const minClearance = 20; // Min space between text edge and container edges
        const minRadius = maxRadius * 0.25; // Minimum 25% of max radius

        let fontSize = baseFontSize;
        let textHeight, safeRadius;

        // Iteratively reduce font size until text fits with clearance
        for (let size = baseFontSize; size >= 7; size -= 0.5) {
            const tempText = new PIXI.Text(textLabel, {
                fontSize: size,
                fontWeight: 'bold',
                fontFamily: 'sans-serif'
            });

            textHeight = tempText.width; // Width becomes height when rotated
            tempText.destroy();

            const availableSpace = (containerHeight - textHeight) / 2;

            // Check if text fits with minimum clearance
            if (availableSpace >= minClearance) {
                fontSize = size;
                safeRadius = Math.min(maxRadius, Math.max(minRadius, availableSpace - minClearance));
                break;
            }
        }

        return { fontSize, safeRadius: safeRadius || minRadius };
    }

    // Adjust label Y position to avoid crossing container edges
    getSafeLabelY(textLabel, centerY, containerTop, containerBottom, fontSize) {
        const tempText = new PIXI.Text(textLabel, {
            fontSize: fontSize,
            fontWeight: 'bold',
            fontFamily: 'sans-serif'
        });
        const textHeight = tempText.width; // Width becomes height when rotated
        tempText.destroy();

        const halfTextHeight = textHeight / 2;
        const edgeBuffer = 10; // Buffer around edges

        // Check if centered position works
        let labelY = centerY;
        const textTop = labelY - halfTextHeight;
        const textBottom = labelY + halfTextHeight;

        // Check collision with all other container edges
        for (const edge of this.containerEdges) {
            // Skip edges outside our container bounds
            if (edge.y < containerTop || edge.y > containerBottom) continue;

            // If edge intersects text, shift text UP first
            if (edge.y > textTop - edgeBuffer && edge.y < textBottom + edgeBuffer) {
                // Try shifting up first
                const shiftedUpY = edge.y - halfTextHeight - edgeBuffer;
                if (shiftedUpY - halfTextHeight >= containerTop) {
                    labelY = shiftedUpY;
                    break;
                }
                // Otherwise shift down
                const shiftedDownY = edge.y + halfTextHeight + edgeBuffer;
                if (shiftedDownY + halfTextHeight <= containerBottom) {
                    labelY = shiftedDownY;
                    break;
                }
            }
        }

        return labelY;
    }

    drawRoundedRect(graphics, x, y, width, height, radii) {
        const [tl, tr, br, bl] = radii;

        graphics.moveTo(x + tl, y);
        graphics.lineTo(x + width - tr, y);

        if (tr > 0) {
            graphics.quadraticCurveTo(x + width, y, x + width, y + tr);
        } else {
            graphics.lineTo(x + width, y);
        }

        graphics.lineTo(x + width, y + height - br);

        if (br > 0) {
            graphics.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
        } else {
            graphics.lineTo(x + width, y + height);
        }

        graphics.lineTo(x + bl, y + height);

        if (bl > 0) {
            graphics.quadraticCurveTo(x, y + height, x, y + height - bl);
        } else {
            graphics.lineTo(x, y + height);
        }

        graphics.lineTo(x, y + tl);

        if (tl > 0) {
            graphics.quadraticCurveTo(x, y, x + tl, y);
        } else {
            graphics.lineTo(x, y);
        }

        graphics.closePath();
    }

    // Calculate bounds for discipline/phase from tasks
    calculateBounds(taskIndices) {
        if (taskIndices.length === 0) return null;

        const minIndex = Math.min(...taskIndices);
        const maxIndex = Math.max(...taskIndices);

        const y = this.indexToY(minIndex);
        const height = this.indexToY(maxIndex + 1) - y;

        return { y, height };
    }

    // Build discipline task mapping (called once)
    buildDisciplineTaskMap() {
        this.disciplineTaskMap = {};
        this.data.tasks.forEach((task, index) => {
            const disciplines = task.disciplines || [];
            disciplines.forEach(disciplineId => {
                if (!this.disciplineTaskMap[disciplineId]) {
                    this.disciplineTaskMap[disciplineId] = [];
                }
                this.disciplineTaskMap[disciplineId].push(index);
            });
        });
    }

    // Draw disciplines based on visible tasks
    drawDynamicDisciplines(visibleTaskIndices) {
        this.disciplinesContainer.removeChildren();
        this.bordersContainer.removeChildren(); // Clear borders for redraw
        this.disciplineData = [];
        this.containerEdges = this.containerEdges.filter(e => e.side !== 'left');

        Object.keys(this.data.disciplines).forEach(disciplineId => {
            const discipline = this.data.disciplines[disciplineId];
            if (discipline.side !== 'left') return;

            // Get tasks for this discipline that are visible
            const allTaskIndices = this.disciplineTaskMap[disciplineId] || [];
            const taskIndices = allTaskIndices.filter(i => visibleTaskIndices.includes(i));
            if (taskIndices.length === 0) return;

            const bounds = this.calculateBounds(taskIndices);
            if (!bounds) return;

            let y = bounds.y;
            let height = bounds.height;

            // Extend beyond if last visible task is the discipline's last task
            if (discipline.extendBeyondTasks && this.settings.extraTimeSteps) {
                const maxTaskIndex = Math.max(...allTaskIndices);
                const maxVisibleIndex = Math.max(...taskIndices);
                if (maxVisibleIndex === maxTaskIndex) {
                    height += this.settings.extraTimeSteps * this.settings.stepHeight;
                }
            }

            const centerX = this.settings.centerX;
            const labelWidth = 50;
            const order = discipline.order || 0;
            const width = (order + 1) * labelWidth;
            const maxRadius = this.settings.cornerRadius;
            const { fontSize, safeRadius } = this.getSafeTextAndRadius(discipline.label, height, maxRadius);

            // Use first visible task's progress only
            const firstTaskIndex = Math.min(...taskIndices);
            const firstTaskProgress = this.taskElements[firstTaskIndex]?.animationProgress || 0;

            // Lock progress once fully animated
            if (!this.disciplineAnimProgress[disciplineId]) {
                this.disciplineAnimProgress[disciplineId] = firstTaskProgress;
            } else if (firstTaskProgress > this.disciplineAnimProgress[disciplineId]) {
                this.disciplineAnimProgress[disciplineId] = firstTaskProgress;
            }

            const easedProgress = 1 - Math.pow(1 - this.disciplineAnimProgress[disciplineId], 3);
            const currentWidth = width * easedProgress;

            const x = centerX - currentWidth;

            const graphics = new PIXI.Graphics();
            const { color, alpha } = this.getContainerColor(discipline.color);

            // Draw fill with blend mode
            graphics.beginFill(color, alpha);
            const radii = [safeRadius * easedProgress, 0, 0, safeRadius * easedProgress];
            this.drawRoundedRect(graphics, x, y, currentWidth, height, radii);
            graphics.endFill();
            graphics.blendMode = PIXI.BLEND_MODES[this.colors.blendMode];

            this.disciplinesContainer.addChild(graphics);

            // Draw border separately (no blend mode for visibility)
            const borderGraphics = new PIXI.Graphics();
            borderGraphics.lineStyle(1.5, this.colors.containerBorder);
            this.drawRoundedRect(borderGraphics, x, y, currentWidth, height, radii);
            this.bordersContainer.addChild(borderGraphics);

            this.containerEdges.push({ y: y, side: 'left' });
            this.containerEdges.push({ y: y + height, side: 'left' });

            this.disciplineData.push({
                discipline,
                y,
                height,
                order,
                centerX,
                labelWidth,
                currentWidth,
                fontSize,
                fullWidth: width,
                bounds: { x, y, width: currentWidth, height }
            });
        });
    }

    // Draw intersections between disciplines and phases
    drawIntersections() {
        this.intersectionsContainer.removeChildren();

        if (!this.disciplineData || !this.phaseData) return;

        this.disciplineData.forEach(disc => {
            this.phaseData.forEach(phase => {
                const r1 = disc.bounds;
                const r2 = phase.rectBounds;

                // Check overlap
                if (r1.x < r2.x + r2.width &&
                    r1.x + r1.width > r2.x &&
                    r1.y < r2.y + r2.height &&
                    r1.y + r1.height > r2.y) {

                    // Calculate intersection rect
                    const ix = Math.max(r1.x, r2.x);
                    const iy = Math.max(r1.y, r2.y);
                    const iw = Math.min(r1.x + r1.width, r2.x + r2.width) - ix;
                    const ih = Math.min(r1.y + r1.height, r2.y + r2.height) - iy;

                    // Draw intersection
                    const graphics = new PIXI.Graphics();
                    graphics.beginFill(this.colors.intersectionColor, this.colors.intersectionAlpha);
                    graphics.drawRect(ix, iy, iw, ih);
                    graphics.endFill();

                    this.intersectionsContainer.addChild(graphics);
                }
            });
        });
    }

    drawDisciplineLabels() {
        if (!this.disciplineData) return;

        // Clear old discipline labels
        const oldLabels = this.labelsContainer.children.filter(c => c.userData?.type === 'discipline');
        oldLabels.forEach(l => l.destroy());

        this.disciplineData.forEach(data => {
            const { discipline, y, height, order, centerX, labelWidth, currentWidth, fullWidth, fontSize } = data;

            // Only show label if this discipline's lane is mostly visible
            const progress = currentWidth / fullWidth;
            if (progress < 0.3) return;

            const labelX = centerX - ((order + 1) * labelWidth) + (labelWidth / 2);
            const centerLabelY = y + (height / 2);
            const labelY = this.getSafeLabelY(discipline.label, centerLabelY, y, y + height, fontSize);

            const label = new PIXI.Text(discipline.label, {
                fontSize: fontSize,
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
                fill: this.colors.labelText,
                alpha: Math.min(progress * 1.5, this.colors.labelAlpha)
            });
            label.anchor.set(0.5, 0.5);
            label.position.set(labelX, labelY);
            label.rotation = -Math.PI / 2;
            label.userData = { type: 'discipline' };
            this.labelsContainer.addChild(label);
        });
    }

    // Get all task indices for a phase, including descendant phases
    getPhaseTaskIndices(phaseId, phaseTaskMap) {
        let indices = [...(phaseTaskMap[phaseId] || [])];

        // Add tasks from child phases
        Object.keys(this.data.phases).forEach(childId => {
            const childPhase = this.data.phases[childId];
            if (childPhase.parent === phaseId) {
                indices = indices.concat(this.getPhaseTaskIndices(childId, phaseTaskMap));
            }
        });

        return indices;
    }

    // Get depth of phase in hierarchy (0 = root, 1 = child, etc)
    getPhaseDepth(phaseId) {
        const phase = this.data.phases[phaseId];
        if (!phase || !phase.parent) return 0;
        return 1 + this.getPhaseDepth(phase.parent);
    }

    // Get max depth of all descendants (how many label lanes needed)
    getMaxDescendantDepth(phaseId) {
        let maxDepth = 0;
        Object.keys(this.data.phases).forEach(childId => {
            const childPhase = this.data.phases[childId];
            if (childPhase.parent === phaseId) {
                maxDepth = Math.max(maxDepth, 1 + this.getMaxDescendantDepth(childId));
            }
        });
        return maxDepth;
    }

    // Build phase task mapping (called once)
    buildPhaseTaskMap() {
        this.phaseTaskMap = {};
        this.data.tasks.forEach((task, index) => {
            const phases = task.phases || [];
            phases.forEach(phaseId => {
                if (!this.phaseTaskMap[phaseId]) {
                    this.phaseTaskMap[phaseId] = [];
                }
                this.phaseTaskMap[phaseId].push(index);
            });
        });
    }

    // Draw phases based on visible tasks
    drawDynamicPhases(visibleTaskIndices) {
        this.phasesContainer.removeChildren();
        this.phaseData = [];
        this.containerEdges = this.containerEdges.filter(e => e.side !== 'right');

        const phaseIds = Object.keys(this.data.phases).sort((a, b) => {
            return this.getPhaseDepth(b) - this.getPhaseDepth(a);
        });

        phaseIds.forEach(phaseId => {
            const phase = this.data.phases[phaseId];
            if (!phase) return;

            // Get all indices including descendants that are visible
            const allIndices = this.getPhaseTaskIndices(phaseId, this.phaseTaskMap);
            const indices = allIndices.filter(i => visibleTaskIndices.includes(i));
            if (indices.length === 0) return;

            const bounds = this.calculateBounds(indices);
            if (!bounds) return;

            const centerX = this.settings.centerX;
            const contentWidth = this.settings.taskWidth;
            const labelWidth = 50;
            const order = phase.order || 0;
            const totalLabelWidth = (order + 1) * labelWidth;
            const maxRadius = this.settings.cornerRadius;
            const { fontSize, safeRadius } = this.getSafeTextAndRadius(phase.label, bounds.height, maxRadius);
            const x = centerX;

            // Use first visible task's progress only
            const firstTaskIndex = Math.min(...indices);
            const firstTaskProgress = this.taskElements[firstTaskIndex]?.animationProgress || 0;

            // Lock progress once fully animated
            if (!this.phaseAnimProgress[phaseId]) {
                this.phaseAnimProgress[phaseId] = firstTaskProgress;
            } else if (firstTaskProgress > this.phaseAnimProgress[phaseId]) {
                this.phaseAnimProgress[phaseId] = firstTaskProgress;
            }

            const easedProgress = 1 - Math.pow(1 - this.phaseAnimProgress[phaseId], 3);
            const currentContentWidth = contentWidth * easedProgress;
            const currentLabelWidth = totalLabelWidth * easedProgress;

            const graphics = new PIXI.Graphics();
            const { color, alpha } = this.getContainerColor(phase.color);

            // Draw fill with blend mode
            graphics.beginFill(color, alpha);

            // Draw content area (animated width)
            graphics.drawRect(x, bounds.y, currentContentWidth, bounds.height);

            // Draw label area (animated width)
            if (currentLabelWidth > 0) {
                graphics.moveTo(x + currentContentWidth, bounds.y);
                graphics.lineTo(x + currentContentWidth + currentLabelWidth - safeRadius * easedProgress, bounds.y);
                graphics.quadraticCurveTo(
                    x + currentContentWidth + currentLabelWidth, bounds.y,
                    x + currentContentWidth + currentLabelWidth, bounds.y + safeRadius * easedProgress
                );
                graphics.lineTo(x + currentContentWidth + currentLabelWidth, bounds.y + bounds.height - safeRadius * easedProgress);
                graphics.quadraticCurveTo(
                    x + currentContentWidth + currentLabelWidth, bounds.y + bounds.height,
                    x + currentContentWidth + currentLabelWidth - safeRadius * easedProgress, bounds.y + bounds.height
                );
                graphics.lineTo(x + currentContentWidth, bounds.y + bounds.height);
                graphics.lineTo(x + currentContentWidth, bounds.y);
            }

            graphics.endFill();
            graphics.blendMode = PIXI.BLEND_MODES[this.colors.blendMode];

            this.phasesContainer.addChild(graphics);

            // Draw border separately (no blend mode for visibility)
            const borderGraphics = new PIXI.Graphics();
            borderGraphics.lineStyle(1.5, this.colors.containerBorder);

            // Border for content area
            borderGraphics.drawRect(x, bounds.y, currentContentWidth, bounds.height);

            // Border for label area
            if (currentLabelWidth > 0) {
                borderGraphics.moveTo(x + currentContentWidth, bounds.y);
                borderGraphics.lineTo(x + currentContentWidth + currentLabelWidth - safeRadius * easedProgress, bounds.y);
                borderGraphics.quadraticCurveTo(
                    x + currentContentWidth + currentLabelWidth, bounds.y,
                    x + currentContentWidth + currentLabelWidth, bounds.y + safeRadius * easedProgress
                );
                borderGraphics.lineTo(x + currentContentWidth + currentLabelWidth, bounds.y + bounds.height - safeRadius * easedProgress);
                borderGraphics.quadraticCurveTo(
                    x + currentContentWidth + currentLabelWidth, bounds.y + bounds.height,
                    x + currentContentWidth + currentLabelWidth - safeRadius * easedProgress, bounds.y + bounds.height
                );
                borderGraphics.lineTo(x + currentContentWidth, bounds.y + bounds.height);
                borderGraphics.lineTo(x + currentContentWidth, bounds.y);
            }

            this.bordersContainer.addChild(borderGraphics);

            this.containerEdges.push({ y: bounds.y, side: 'right' });
            this.containerEdges.push({ y: bounds.y + bounds.height, side: 'right' });

            this.phaseData.push({
                phase,
                bounds,
                x,
                contentWidth: currentContentWidth,
                order,
                labelWidth,
                fontSize,
                fullContentWidth: contentWidth,
                rectBounds: { x, y: bounds.y, width: currentContentWidth + currentLabelWidth, height: bounds.height }
            });
        });
    }

    drawPhaseLabels() {
        if (!this.phaseData) return;

        // Clear old phase labels
        const oldLabels = this.labelsContainer.children.filter(c => c.userData?.type === 'phase');
        oldLabels.forEach(l => l.destroy());

        this.phaseData.forEach(data => {
            const { phase, bounds, x, contentWidth, order, labelWidth, fontSize, fullContentWidth } = data;

            // Only show label if phase is mostly visible
            const progress = contentWidth / fullContentWidth;
            if (progress < 0.3) return;

            // Label position using order (same as disciplines)
            const labelX = x + contentWidth + (order * labelWidth) + (labelWidth / 2);
            const centerLabelY = bounds.y + (bounds.height / 2);
            const labelY = this.getSafeLabelY(phase.label, centerLabelY, bounds.y, bounds.y + bounds.height, fontSize);

            const label = new PIXI.Text(phase.label, {
                fontSize: fontSize,
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
                fill: this.colors.labelText,
                alpha: Math.min(progress * 1.5, this.colors.labelAlpha)
            });
            label.anchor.set(0.5, 0.5);
            label.position.set(labelX, labelY);
            label.rotation = -Math.PI / 2;
            label.userData = { type: 'phase' };
            this.labelsContainer.addChild(label);
        });
    }


    drawTasks() {
        const taskWidth = this.settings.taskWidth;
        const taskHeight = this.settings.stepHeight;
        const centerX = this.settings.centerX;

        this.taskElements = []; // Reset

        this.data.tasks.forEach((task, index) => {
            const y = this.indexToY(index);
            const x = centerX;

            // Create task container
            const taskContainer = new PIXI.Container();
            taskContainer.position.set(x, y);
            this.container.addChild(taskContainer);

            // Graphics for box
            const graphics = new PIXI.Graphics();
            taskContainer.addChild(graphics);

            // Text with typewriter
            const textStyle = new PIXI.TextStyle({
                fontSize: 10,
                fontFamily: 'sans-serif',
                fill: this.colors.taskText,
                wordWrap: true,
                wordWrapWidth: taskWidth - 12
            });

            const text = new PIXI.Text('', textStyle);
            text.position.set(6, taskHeight / 2);
            text.anchor.set(0, 0.5);
            taskContainer.addChild(text);

            // Create mask for horizontal reveal
            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            mask.drawRect(0, 0, 0, taskHeight); // Start with 0 width
            mask.endFill();
            taskContainer.addChild(mask);
            taskContainer.mask = mask;

            // Store for animation
            this.taskElements.push({
                container: taskContainer,
                graphics: graphics,
                text: text,
                mask: mask,
                fullLabel: task.label,
                charIndex: 0,
                y: y,
                animationProgress: 0,
                taskWidth: taskWidth,
                taskHeight: taskHeight
            });
        });
    }

    drawSpine() {
        const centerX = this.settings.centerX;
        const startY = this.settings.topPadding;
        const maxContentEndY = this.calculateMaxEndY();
        const arrowMargin = 20; // Space before arrow
        const endY = maxContentEndY + arrowMargin;

        // Store spine properties for animation
        this.spineProps = { centerX, startY, endY };

        // Create spine graphics (will be drawn during animation)
        this.spineGraphics = new PIXI.Graphics();
        this.container.addChild(this.spineGraphics);

        // Arrow graphics (will be drawn during animation)
        this.arrowGraphics = new PIXI.Graphics();
        this.container.addChild(this.arrowGraphics);

        // "time" label (will follow arrow)
        this.timeLabel = new PIXI.Text('time', {
            fontSize: 12,
            fontStyle: 'italic',
            fontFamily: 'serif',
            fill: this.colors.timeLabel
        });
        this.timeLabel.visible = false; // Hidden until arrow appears
        this.container.addChild(this.timeLabel);
    }

    animate(delta) {
        if (!this.startTime) {
            this.startTime = Date.now();
        }

        const elapsed = Date.now() - this.startTime;
        this.animationProgress = Math.min(elapsed / this.animationDuration, 1);

        // Update spine and get current arrow Y
        this.updateSpine(this.animationProgress);

        // Update tasks based on arrow position
        this.updateTasks();

        // Get visible task indices (tasks that have started animating)
        const visibleTaskIndices = [];
        this.taskElements.forEach((taskEl, index) => {
            if (taskEl.animationProgress > 0) {
                visibleTaskIndices.push(index);
            }
        });

        // Redraw phases and disciplines to span visible tasks
        if (visibleTaskIndices.length > 0) {
            // Reset color index for consistent colors each frame
            this.containerColorIndex = 0;
            this.drawDynamicDisciplines(visibleTaskIndices);
            this.drawDynamicPhases(visibleTaskIndices);
            this.drawIntersections();
            // Redraw labels
            this.drawDisciplineLabels();
            this.drawPhaseLabels();
        }

        // Stop animation when complete
        if (this.animationProgress >= 1) {
            this.app.ticker.remove(this.animate, this);
        }
    }

    updateSpine(progress) {
        const { centerX, startY, endY } = this.spineProps;

        // Ease in-out: fast start, slow end
        const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        this.currentArrowY = startY + (endY - startY) * easedProgress;

        // Draw spine line
        this.spineGraphics.clear();
        this.spineGraphics.lineStyle(2, this.colors.spine);
        this.spineGraphics.moveTo(centerX, startY);
        this.spineGraphics.lineTo(centerX, this.currentArrowY);

        // Draw arrow at current position
        this.arrowGraphics.clear();
        this.arrowGraphics.beginFill(this.colors.spine);
        this.arrowGraphics.moveTo(centerX, this.currentArrowY + 8);
        this.arrowGraphics.lineTo(centerX - 5, this.currentArrowY);
        this.arrowGraphics.lineTo(centerX + 5, this.currentArrowY);
        this.arrowGraphics.closePath();
        this.arrowGraphics.endFill();

        // Show and position time label at arrow tip
        this.timeLabel.visible = true;
        this.timeLabel.position.set(centerX + 15, this.currentArrowY);
    }

    updateTasks() {
        const taskAnimDuration = this.taskAnimDuration;

        this.taskElements.forEach((taskEl, index) => {
            const taskY = taskEl.y;

            // Start animating when arrow is past task Y + offset
            if (this.currentArrowY >= (taskY + this.taskTriggerOffset) && taskEl.animationProgress < 1) {
                // Calculate how long this task has been animating
                if (taskEl.startTime === undefined) {
                    taskEl.startTime = Date.now();
                }

                const elapsed = Date.now() - taskEl.startTime;
                taskEl.animationProgress = Math.min(elapsed / taskAnimDuration, 1);

                const progress = taskEl.animationProgress;

                // Grow mask width (ease out cubic for smoothness)
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                const currentWidth = taskEl.taskWidth * easedProgress;

                // Update mask
                taskEl.mask.clear();
                taskEl.mask.beginFill(0xffffff);
                taskEl.mask.drawRect(0, 0, currentWidth, taskEl.taskHeight);
                taskEl.mask.endFill();

                // Draw box
                taskEl.graphics.clear();
                taskEl.graphics.lineStyle(1, this.colors.taskBorder);
                taskEl.graphics.drawRect(0, 0, currentWidth, taskEl.taskHeight);

                // Typewriter effect (starts halfway through grow)
                if (progress > 0.5) {
                    const typeProgress = (progress - 0.5) / 0.5;
                    const targetChars = Math.floor(taskEl.fullLabel.length * typeProgress);

                    if (taskEl.charIndex < targetChars) {
                        taskEl.charIndex = targetChars;
                        taskEl.text.text = taskEl.fullLabel.substring(0, taskEl.charIndex);
                    }
                }
            }
        });
    }

    render() {
        // Clear edges from previous render
        this.containerEdges = [];

        // Build mappings for dynamic drawing
        this.buildDisciplineTaskMap();
        this.buildPhaseTaskMap();

        // Setup spine (will be animated)
        this.drawSpine();

        // Setup tasks (will be animated)
        this.drawTasks();

        // Start animation
        this.app.ticker.add(this.animate, this);
    }
}

window.onload = async () => {
    const response = await fetch('examples/example-product.json');
    const data = await response.json();

    const app = new PIXI.Application({
        width: data.settings.canvasWidth,
        height: 2000, // Temp height, will resize
        backgroundColor: COLOR_SCHEMES[ACTIVE_SCHEME].background,
        antialias: true
    });

    document.getElementById('app').appendChild(app.view);

    const diagramRenderer = new DiagramRenderer(data, app);

    // Calculate actual needed height
    const maxContentEndY = diagramRenderer.calculateMaxEndY();
    const canvasHeight = maxContentEndY + 60; // Arrow + bottom padding
    app.renderer.resize(data.settings.canvasWidth, canvasHeight);

    diagramRenderer.render();
};
