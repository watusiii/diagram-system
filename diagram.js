class DiagramRenderer {
    constructor(data, app) {
        this.data = data;
        this.settings = data.settings;
        this.app = app;
        this.container = new PIXI.Container();
        app.stage.addChild(this.container);
        this.containerEdges = []; // Track all container edges for collision detection
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

    drawLeftDisciplines() {
        // Group tasks by discipline
        const disciplineTaskMap = {};

        this.data.tasks.forEach((task, index) => {
            const disciplines = task.disciplines || [];
            disciplines.forEach(disciplineId => {
                if (!disciplineTaskMap[disciplineId]) {
                    disciplineTaskMap[disciplineId] = [];
                }
                disciplineTaskMap[disciplineId].push(index);
            });
        });

        // Store discipline data for later label drawing
        this.disciplineData = [];

        // Draw LEFT side disciplines only (with rounded tab shape)
        Object.keys(this.data.disciplines).forEach(disciplineId => {
            const discipline = this.data.disciplines[disciplineId];
            if (discipline.side !== 'left') return;

            // Calculate bounds from assigned tasks
            const taskIndices = disciplineTaskMap[disciplineId] || [];
            if (taskIndices.length === 0) return;

            const bounds = this.calculateBounds(taskIndices);
            if (!bounds) return;

            let y = bounds.y;
            let height = bounds.height;

            // Extend beyond tasks if specified
            if (discipline.extendBeyondTasks && this.settings.extraTimeSteps) {
                height += this.settings.extraTimeSteps * this.settings.stepHeight;
            }

            const centerX = this.settings.centerX;
            const labelWidth = 50;
            const order = discipline.order || 0;

            // Width is just label lanes, no content area
            const width = (order + 1) * labelWidth;
            const maxRadius = this.settings.cornerRadius;
            const { fontSize, safeRadius } = this.getSafeTextAndRadius(discipline.label, height, maxRadius);
            const x = centerX - width;

            const graphics = new PIXI.Graphics();
            const { color, alpha } = this.hexToNumber(discipline.color);

            graphics.beginFill(color, alpha);
            graphics.lineStyle(1.5, 0x333333);

            // Draw label area only - rounded on left edge, sharp on right (spine) edge
            const radii = [safeRadius, 0, 0, safeRadius];
            this.drawRoundedRect(graphics, x, y, width, height, radii);

            graphics.endFill();
            graphics.blendMode = PIXI.BLEND_MODES.MULTIPLY;

            this.container.addChild(graphics);

            // Track edges for collision detection
            this.containerEdges.push({ y: y, side: 'left' }); // Top edge
            this.containerEdges.push({ y: y + height, side: 'left' }); // Bottom edge

            // Store data for label drawing
            this.disciplineData.push({
                discipline,
                y,
                height,
                order,
                centerX,
                labelWidth,
                fontSize
            });
        });
    }

    drawDisciplineLabels() {
        if (!this.disciplineData) return;

        this.disciplineData.forEach(data => {
            const { discipline, y, height, order, centerX, labelWidth, fontSize } = data;

            const labelX = centerX - ((order + 1) * labelWidth) + (labelWidth / 2);
            const centerLabelY = y + (height / 2);
            const labelY = this.getSafeLabelY(discipline.label, centerLabelY, y, y + height, fontSize);

            const label = new PIXI.Text(discipline.label, {
                fontSize: fontSize,
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
                fill: 0x000000,
                alpha: 0.7
            });
            label.anchor.set(0.5, 0.5);
            label.position.set(labelX, labelY);
            label.rotation = -Math.PI / 2;
            this.container.addChild(label);
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

    drawPhaseContainers() {
        // Group tasks by their direct phase
        const phaseTaskMap = {};

        this.data.tasks.forEach((task, index) => {
            const phases = task.phases || [];
            phases.forEach(phaseId => {
                if (!phaseTaskMap[phaseId]) {
                    phaseTaskMap[phaseId] = [];
                }
                phaseTaskMap[phaseId].push(index);
            });
        });

        // Sort phases by depth (children first, then parents - so parents draw on top)
        const phaseIds = Object.keys(this.data.phases).sort((a, b) => {
            return this.getPhaseDepth(b) - this.getPhaseDepth(a);
        });

        // Store phase data for later label drawing
        this.phaseData = [];

        // Draw each phase
        phaseIds.forEach(phaseId => {
            const phase = this.data.phases[phaseId];
            if (!phase) return;

            // Get all indices including descendants
            const allIndices = this.getPhaseTaskIndices(phaseId, phaseTaskMap);
            if (allIndices.length === 0) return;

            const bounds = this.calculateBounds(allIndices);
            if (!bounds) return;

            const centerX = this.settings.centerX;
            const contentWidth = this.settings.taskWidth;
            const labelWidth = 50;
            const order = phase.order || 0;

            // Width based on order like disciplines
            const totalLabelWidth = (order + 1) * labelWidth;
            const totalWidth = contentWidth + totalLabelWidth;
            const maxRadius = this.settings.cornerRadius;
            const { fontSize, safeRadius } = this.getSafeTextAndRadius(phase.label, bounds.height, maxRadius);
            const x = centerX; // All phases flush to spine

            const graphics = new PIXI.Graphics();
            const { color, alpha } = this.hexToNumber(phase.color);

            graphics.beginFill(color, alpha);
            graphics.lineStyle(1.5, 0x333333);

            // Content area (left) - rectangle, always full width
            graphics.drawRect(x, bounds.y, contentWidth, bounds.height);

            // Label area (right) - rounded corners on outer edge
            graphics.moveTo(x + contentWidth, bounds.y);
            graphics.lineTo(x + contentWidth + totalLabelWidth - safeRadius, bounds.y);
            graphics.quadraticCurveTo(
                x + contentWidth + totalLabelWidth, bounds.y,
                x + contentWidth + totalLabelWidth, bounds.y + safeRadius
            );
            graphics.lineTo(x + contentWidth + totalLabelWidth, bounds.y + bounds.height - safeRadius);
            graphics.quadraticCurveTo(
                x + contentWidth + totalLabelWidth, bounds.y + bounds.height,
                x + contentWidth + totalLabelWidth - safeRadius, bounds.y + bounds.height
            );
            graphics.lineTo(x + contentWidth, bounds.y + bounds.height);
            graphics.lineTo(x + contentWidth, bounds.y);

            graphics.endFill();
            graphics.blendMode = PIXI.BLEND_MODES.MULTIPLY;

            this.container.addChild(graphics);

            // Track edges for collision detection
            this.containerEdges.push({ y: bounds.y, side: 'right' }); // Top edge
            this.containerEdges.push({ y: bounds.y + bounds.height, side: 'right' }); // Bottom edge

            // Store data for label drawing
            this.phaseData.push({
                phase,
                bounds,
                x,
                contentWidth,
                order,
                labelWidth,
                fontSize
            });
        });
    }

    drawPhaseLabels() {
        if (!this.phaseData) return;

        this.phaseData.forEach(data => {
            const { phase, bounds, x, contentWidth, order, labelWidth, fontSize } = data;

            // Label position using order (same as disciplines)
            const labelX = x + contentWidth + (order * labelWidth) + (labelWidth / 2);
            const centerLabelY = bounds.y + (bounds.height / 2);
            const labelY = this.getSafeLabelY(phase.label, centerLabelY, bounds.y, bounds.y + bounds.height, fontSize);

            const label = new PIXI.Text(phase.label, {
                fontSize: fontSize,
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
                fill: 0x000000,
                alpha: 0.7
            });
            label.anchor.set(0.5, 0.5);
            label.position.set(labelX, labelY);
            label.rotation = -Math.PI / 2;
            this.container.addChild(label);
        });
    }


    drawTasks() {
        const taskWidth = this.settings.taskWidth;
        const taskHeight = this.settings.stepHeight; // Edge-to-edge, no gap
        const centerX = this.settings.centerX;

        this.data.tasks.forEach((task, index) => {
            const y = this.indexToY(index);
            const x = centerX; // All tasks flush to spine

            // Draw task box (simple rectangle, no rounded corners, no fill)
            const graphics = new PIXI.Graphics();
            graphics.lineStyle(1, 0x000000);
            graphics.drawRect(x, y, taskWidth, taskHeight);

            this.container.addChild(graphics);

            // Draw text
            const textStyle = new PIXI.TextStyle({
                fontSize: 10,
                fontFamily: 'sans-serif',
                fill: 0x222222,
                wordWrap: true,
                wordWrapWidth: taskWidth - 12
            });

            const text = new PIXI.Text(task.label, textStyle);
            text.position.set(x + 6, y + (taskHeight - text.height) / 2);
            this.container.addChild(text);
        });
    }

    drawSpine() {
        const centerX = this.settings.centerX;
        const startY = this.settings.topPadding;
        const maxContentEndY = this.calculateMaxEndY();
        const arrowMargin = 20; // Space before arrow
        const endY = maxContentEndY + arrowMargin;

        const graphics = new PIXI.Graphics();
        graphics.lineStyle(2, 0x333333);
        graphics.moveTo(centerX, startY);
        graphics.lineTo(centerX, endY);
        this.container.addChild(graphics);

        // Arrow
        const arrow = new PIXI.Graphics();
        arrow.beginFill(0x333333);
        arrow.moveTo(centerX, endY + 8);
        arrow.lineTo(centerX - 5, endY);
        arrow.lineTo(centerX + 5, endY);
        arrow.closePath();
        arrow.endFill();
        this.container.addChild(arrow);

        // "time" label
        const timeLabel = new PIXI.Text('time', {
            fontSize: 12,
            fontStyle: 'italic',
            fontFamily: 'serif',
            fill: 0x333333
        });
        timeLabel.position.set(centerX + 15, endY);
        this.container.addChild(timeLabel);
    }

    render() {
        // Clear edges from previous render
        this.containerEdges = [];

        // Draw order: spine → containers (collect edges) → labels (avoid edges) → tasks
        this.drawSpine();
        this.drawLeftDisciplines();
        this.drawPhaseContainers();
        // Now draw all labels with edge collision detection
        this.drawDisciplineLabels();
        this.drawPhaseLabels();
        this.drawTasks();
    }
}

window.onload = async () => {
    const response = await fetch('diagram-data.json');
    const data = await response.json();

    const app = new PIXI.Application({
        width: data.settings.canvasWidth,
        height: 2000, // Temp height, will resize
        backgroundColor: 0xa6c8a9,
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
