import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as prettier from "prettier";
import markdown from "prettier/parser-markdown";

export interface CursorPosition {
  line: number;
  ch: number;
}

interface Hotkey {
  modifiers: ("Mod" | "Shift" | "Alt" | "Ctrl")[];
  key: string;
}

type HotkeyMap = Record<string, Hotkey[]>;

interface HotkeyManager {
  customKeys?: HotkeyMap;
  defaultKeys: HotkeyMap;
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
      .setDesc(
        "If enabled, format the current note when you save the file via hotkey"
      )
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

// There is a prettier bug where they add extra space after a list item
const fixListItemIndent = (text: string): string => {
  return text.replace(/^([ ]*)[-*][ ]+/gm, "$1- ");
};

export default class PrettierPlugin extends Plugin {
  public settings: PrettierPluginSettings = {};
  private saveCallback = () => undefined;

  public async onload(): Promise<void> {
    console.log("Load Prettier Format plugin");

    this.settings = {
      ...(await this.loadData()),
    };

    this.addCommand({
      id: "format-note",
      name: "Format the entire note",
      callback: this.formatAll,
    });

    this.addCommand({
      id: "format-selection",
      name: "Format the just the selection in the note",
      callback: () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

        if (activeView) {
          const editor = activeView.sourceMode.cmEditor;
          const text = editor.getSelection();
          const formatted = fixListItemIndent(
            prettier.format(text, {
              parser: "markdown",
              plugins: [markdown],
              ...this.getPrettierSettings(editor),
            })
          );

          if (formatted === text) {
            return;
          }

          editor.replaceSelection(formatted);
        }
      },
    });

    this.addSettingTab(new PrettierFormatSettingsTab(this.app, this));

    const save = (this.saveCallback = (this.app as any).commands?.commands?.[
      "editor:save-file"
    ]?.callback);

    if (save) {
      (this.app as any).commands.commands["editor:save-file"].callback = () => {
        if (this.settings.formatOnSave) {
          this.formatAll();
        }

        save();
      };
    }
  }

  private getPrettierSettings = (cm: CodeMirror.Editor) => {
    const tabWidth = cm.getOption("tabSize") || 4;
    const useTabs = cm.getOption("indentWithTabs") ?? true;

    return { tabWidth, useTabs };
  };

  private readonly formatAll = (): void => {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeView) {
      const editor = activeView.sourceMode.cmEditor;
      const text = editor.getValue();
      const cursor = editor.getCursor();
      const position = positionToCursorOffset(text, cursor);
      const {
        formatted: rawFormatted,
        cursorOffset,
      } = prettier.formatWithCursor(text, {
        parser: "markdown",
        plugins: [markdown],
        cursorOffset: position,
        ...this.getPrettierSettings(editor),
      });
      const formatted = fixListItemIndent(rawFormatted);

      if (formatted === text) {
        return;
      }

      editor.setValue(formatted);
      editor.setCursor(cursorOffsetToPosition(formatted, cursorOffset));
      const { left, top } = editor.getScrollInfo();
      editor.scrollTo(left, top);
    }
  };
}
