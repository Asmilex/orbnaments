import { App, Modal, Notice, Setting } from "obsidian";
import { moment } from "obsidian";

export async function createExpenseNote(app: App) {
	new ExpenseNameModal(app, async (name, graphignore) => {
		const date = moment().format("YYYY-MM-DD");
		const expenseName =
			name && name.trim().length > 0 ? name.trim() : "expense";
		let fileName = `${date} ${expenseName}.md`;

		const content = `---
categories:
  - "[[expenses]]"
adquired: ${date}
graphignore: ${graphignore}
cost:
---
`;
		try {
			// Check if file already exists to avoid conflict
			if (app.vault.getAbstractFileByPath(fileName)) {
				fileName = `${date} ${expenseName} ${moment().format("HHmmss")}.md`;
			}

			const file = await app.vault.create(fileName, content);

			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file);
		} catch (error: any) {
			new Notice("Could not create expense note: " + error.message);
			console.error("Error creating expense note:", error);
		}
	}).open();
}

class ExpenseNameModal extends Modal {
	onSubmit: (name: string, graphignore: boolean) => void;
	resultName: string = "";
	resultGraphignore: boolean = true;

	constructor(
		app: App,
		onSubmit: (name: string, graphignore: boolean) => void,
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		new Setting(contentEl).setName("Note name").addText((text) => {
			text.onChange((value) => {
				this.resultName = value;
			});
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					this.close();
					this.onSubmit(this.resultName, this.resultGraphignore);
				}
			});
			// Focus the input when modal opens
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(contentEl)
			.setName("Ignore in graph")
			.addToggle((toggle) => {
				toggle.setValue(this.resultGraphignore);
				toggle.onChange((value) => {
					this.resultGraphignore = value;
				});
			});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Create")
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.resultName, this.resultGraphignore);
				}),
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
