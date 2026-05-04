

# README.md

## The Process Visualization Engine
**A dynamic, canvas-based renderer for multi-disciplinary timelines.**

This tool is a digital homage to the iconic "Type Design Process" diagram found in the **FontForge** documentation. It transforms abstract JSON structures into sophisticated "Swimlane Timelines" featuring blended intersections, hierarchical phases, and asymmetrical task layouts.

### 🛠 What it’s for
Developers and designers often struggle to visualize how different disciplines (e.g., Engineering, Design, Strategy) overlap and converge during a project lifecycle. This engine provides a high-fidelity, programmatically-generated alternative to static Gantt charts.

### 🚀 How to use it
1.  **Generate Data**: Use the provided LLM prompt (see `AI_PROMPT_GUIDE.md`) to turn any process or project plan into a compatible `diagram-data.json`.
2.  **Configuration**: 
    * Place your JSON data in the root folder named `diagram-data.json`.
    * Open `index.html` via a local environment.
    * Adjust `settings` in the JSON (e.g., `stepHeight`, `centerX`, `cornerRadius`) to fine-tune the visual density.
3.  **Customization**: Modify `ACTIVE_SCHEME` in `diagram.js` to switch between **Default**, **Dark**, **Blueprint**, or **Primary** color modes.

### 📐 Logical Features
* **Hierarchical Phases**: Use the `parent` key in a phase to create nested containers on the right side of the spine.
* **Intersection Blending**: Assigning multiple disciplines to a single task creates a color-blended "node" showing collaboration.
* **Phase Bridging**: Tasks can exist in multiple phases simultaneously, causing phase containers to stretch and meet at specific timestamps.
* **Lane Continuity**: Set `extendBeyondTasks: true` on a discipline to keep its lane active through the end of the diagram.

---

## 🤖 AI Prompting Guide (`AI_PROMPT_GUIDE.md`)
*Copy and paste this into your local LLM (Gemini, Llama 3, GPT-4) to generate new diagrams.*

> **Prompt:**
> "Act as a Process Architect. I want you to generate a JSON file for a [INSERT TOPIC HERE] launch. 
> 
> **Strict Rules for the JSON:**
> 1. Use the following structure: `settings`, `tasks`, `disciplines`, and `phases`.
> 2. Every task must have a `label`, an array of `phases`, and an array of `disciplines`.
> 3. Each discipline and phase must have a unique `order` integer starting from 0.
> 4. Create visual complexity by having at least three tasks that exist in TWO phases at once (bridging).
> 5. Create collaboration by having at least three tasks that require TWO or more disciplines.
> 6. Include a parent-child relationship in the phases to show hierarchy.
> 7. Output ONLY the raw JSON code."

---

## 📜 Credits & Licensing
* **Original Inspiration**: The "Type Design Process" framework originally found in the **FontForge** documentation.
* **Engine Development**: Created by **Lawrence Watusi** (Lawrence Ervin) at **Extendo**.
* **Terms**: This resource is provided for personal and professional use. Attribution to Watusi @ Extendo is appreciated when sharing generated results.

---

### Why this works for your launch:
* **Authoritative Credit**: It clearly establishes you and **Extendo** as the creators.
* **Developer-Friendly**: It skips the "beginner" fluff and speaks directly to logic, schemas, and AI prompting.
* **Value Prop**: By including the `AI_PROMPT_GUIDE`, you're not just selling code; you're selling a **workflow**.