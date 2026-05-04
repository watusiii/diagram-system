

# README.md

## The Process Visualization Engine
**A dynamic, canvas-based renderer for multi-disciplinary timelines.**

This tool is a digital homage to the iconic "Type Design Process" diagram found in the **FontForge** documentation. It transforms abstract JSON structures into sophisticated "Swimlane Timelines" featuring blended intersections, hierarchical phases, and asymmetrical task layouts.

### 🛠 What it’s for
Developers and designers often struggle to visualize how different disciplines (e.g., Engineering, Design, Strategy) overlap and converge during a project lifecycle. This engine provides a high-fidelity, programmatically-generated alternative to static Gantt charts.

### 🚀 How to use it
1.  **Data Setup**:
    * Place your JSON data in the root folder named `diagram-data.json`.
    * See `examples/` folder for sample JSON structures.
    * Open `index.html` via a local web server or browser.
2.  **Configuration**:
    * Adjust `settings` in the JSON (e.g., `stepHeight`, `centerX`, `cornerRadius`) to fine-tune the visual density.
    * Modify `ACTIVE_SCHEME` in `diagram.js` to switch between **Default**, **Dark**, **Blueprint**, or **Primary** color modes.

### 📐 Logical Features
* **Hierarchical Phases**: Use the `parent` key in a phase to create nested containers on the right side of the spine.
* **Intersection Blending**: Assigning multiple disciplines to a single task creates a color-blended "node" showing collaboration.
* **Phase Bridging**: Tasks can exist in multiple phases simultaneously, causing phase containers to stretch and meet at specific timestamps.
* **Lane Continuity**: Set `extendBeyondTasks: true` on a discipline to keep its lane active through the end of the diagram.

---

## 📜 Credits & Licensing
* **Original Inspiration**: The "Type Design Process" framework originally found in the **FontForge** documentation.
* **Engine Development**: Created by **Lawrence Watusi** (Lawrence Ervin) at **Extendo**.
* **Terms**: This resource is provided for personal and professional use. Attribution to Watusi @ Extendo is appreciated when sharing generated results.

