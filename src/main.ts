import {
  App,
  MarkdownView,
  Plugin,
  PluginManifest,
  PluginSettingTab,
  Setting,
} from "obsidian";
import * as prettier from "prettier";
import markdown from "prettier/parser-markdown";

export interface CursorPosition {
  line: number;
  ch: number;
}

const positionToCursorOffset = (
  code: string,
  { line, ch }: CursorPosition
): number => {
  return code.split("\n").reduce((pos, currLine, index) => {
    if (index < line) {
      return pos + currLine.length + 1;
    }

    if (index === line) {
      return pos + ch;
    }

    return pos;
  }, 0);
};

const cursorOffsetToPosition = (
  code: string,
  cursorOffset: number
): CursorPosition => {
  const substring = code.slice(0, cursorOffset);
  const line = substring.split("\n").length - 1;
  const indexOfLastLine = substring.lastIndexOf("\n");

  return {
    line,
    ch: cursorOffset - indexOfLastLine - 1,
  };
};

class PrettierFormatSettingsTab extends PluginSettingTab {
  private readonly plugin: PrettierPlugin;

  constructor(app: App, plugin: PrettierPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Prettier Format - Settings" });

    new Setting(containerEl)
      .setName("Format on Save")
      .setDesc("If enabled, format the current note on save")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.formatOnSave || false)
          .onChange((value) => {
            this.plugin.settings.formatOnSave = value;
            this.plugin.saveData(this.plugin.settings);
            this.display();
          })
      );
  }
}

interface PrettierPluginSettings {
  formatOnSave?: boolean;
}

export default class PrettierPlugin extends Plugin {
  public settings: PrettierPluginSettings = {};
  private readonly cmEditors: CodeMirror.Editor[];

  constructor(app: App, plugin: PluginManifest) {
    super(app, plugin);

    this.cmEditors = [];

    this.registerCodeMirror((cm) => {
      this.cmEditors.push(cm);
      cm.on("keydown", this.handleKeyDown);
    });
  }

  public async onload(): Promise<void> {
    console.log("Load Prettier Format plugin");

    this.settings = (await this.loadData()) || {};
    this.saveData(this.settings);

    this.addCommand({
      id: "format-note",
      name: "Format the entire note",
      callback: this.formatAll,
    });

    this.addCommand({
      id: "format-selection",
      name: "Format the just the selection in the note",
      callback: () => {
        const activeLeaf = this.app.workspace.activeLeaf;

        if (activeLeaf.view instanceof MarkdownView) {
          const editor = activeLeaf.view.sourceMode.cmEditor;
          const text = editor.getSelection();
          const formatted = prettier.format(text, {
            parser: "markdown",
            plugins: [markdown],
          });

          if (formatted === text) {
            return;
          }

          editor.replaceSelection(formatted);
        }
      },
    });

    this.addSettingTab(new PrettierFormatSettingsTab(this.app, this));
  }

  public onunload(): void {
    console.log("Unloading Prettier Format plugin");

    this.cmEditors.forEach((cm) => {
      cm.off("keydown", this.handleKeyDown);
    });
  }

  private readonly formatAll = (): void => {
    const activeLeaf = this.app.workspace.activeLeaf;

    if (activeLeaf.view instanceof MarkdownView) {
      const editor = activeLeaf.view.sourceMode.cmEditor;
      const text = editor.getValue();
      const cursor = editor.getCursor();
      const position = positionToCursorOffset(text, cursor);
      const { formatted, cursorOffset } = prettier.formatWithCursor(text, {
        parser: "markdown",
        plugins: [markdown],
        cursorOffset: position,
      });

      if (formatted === text) {
        return;
      }

      editor.setValue(formatted);
      editor.setCursor(cursorOffsetToPosition(formatted, cursorOffset));
      const { left, top } = editor.getScrollInfo();
      editor.scrollTo(left, top);
    }
  };

  private readonly handleKeyDown = (
    cm: CodeMirror.Editor,
    event: KeyboardEvent
  ): void => {
    if (this.settings.formatOnSave && event.metaKey && event.key === "s") {
      this.formatAll();
    }
  };
}
