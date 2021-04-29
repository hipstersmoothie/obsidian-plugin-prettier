import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as prettier from "prettier";
import { Options, CursorOptions } from "prettier"
import markdown from "prettier/parser-markdown";
import babel from "prettier/parser-babel";
import html from "prettier/parser-html";

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
    
    new Setting(containerEl)
    .setName("Format code block")
    .setDesc(
      "If enabled, format the code block(just support js, html)"
    )
    .addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.FormatCodeBlock || false)
        .onChange((value) => {
          this.plugin.settings.FormatCodeBlock = value;
          this.plugin.saveData(this.plugin.settings);
          this.display();
        })
    );
  }
}

interface PrettierPluginSettings {
  formatOnSave?: boolean;
  FormatCodeBlock?: boolean;
}

// There is a prettier bug where they add extra space after a list item
const fixListItemIndent = (text: string): string => {
  return text.replace(/^([ ]*)[-*][ ]+/gm, "$1- ");
};

export default class PrettierPlugin extends Plugin {
  public settings: PrettierPluginSettings = {};

  public async onload(): Promise<void> {
    console.log("Load Prettier Format plugin");

    this.settings = {
      ...(await this.loadData()),
    };

    this.addCommand({
      id: "format-note",
      name: "Format the entire note",
      callback: () => {
        this.format("all")
      }
    });

    this.addCommand({
      id: "format-selection",
      name: "Format the just the selection in the note",
      callback: () => {
        this.format("selection")
      },
    });

    this.addSettingTab(new PrettierFormatSettingsTab(this.app, this));

    const saveCommandDefinition = (this.app as any).commands?.commands?.[
      "editor:save-file"
    ];
    const save = saveCommandDefinition?.callback;

    if (typeof save === "function") {
      saveCommandDefinition.callback = () => {
        if (this.settings.formatOnSave) {
          this.format("all");
        }

        save();
      };
    }
  }

  private getPrettierSettings = (cm: CodeMirror.Editor) => {
    const tabWidth = cm.getOption("tabSize") || 4;
    const useTabs = cm.getOption("indentWithTabs") ?? true;
    const embeddedLanguageFormatting = this.settings.FormatCodeBlock ? "auto": "off"

    return { tabWidth, useTabs,embeddedLanguageFormatting };
  };

  private readonly formatAll = (editor: CodeMirror.Editor): void => {
    const text = editor.getValue();
    const cursor = editor.getCursor();
    const position = positionToCursorOffset(text, cursor);
    const {
      formatted: rawFormatted,
      cursorOffset,
    } = prettier.formatWithCursor(text, {
      parser: "markdown",
      plugins: [markdown, babel, html],
      cursorOffset: position,
      ...this.getPrettierSettings(editor),
    } as CursorOptions);
    const formatted = fixListItemIndent(rawFormatted);

    if (formatted === text) {
      return;
    }

    const { left, top } = editor.getScrollInfo();
    editor.setValue(formatted);
    editor.setCursor(cursorOffsetToPosition(formatted, cursorOffset));
    editor.scrollTo(left, top);
  };
  
  formatSelection(editor: CodeMirror.Editor): void {
    const text = editor.getSelection();
    const formatted = fixListItemIndent(
      prettier.format(text, {
        parser: "markdown",
        plugins: [markdown, babel, html],
        ...this.getPrettierSettings(editor),
      } as Options)
    );

    if (formatted === text) {
      return;
    }

    editor.replaceSelection(formatted);
  }

  format(type: string): void {
    const allowFormat = this.getFrontmatterValue("plugin-prettier", true);
    console.log(allowFormat)
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if(activeView && allowFormat === true){
      const editor: CodeMirror.Editor = activeView.sourceMode.cmEditor;

      if(type === "all"){
        this.formatAll(editor)
      }
      else{
        this.formatSelection(editor)
      }
    }
  }

  getFrontmatterValue(key: string, defaultValue: any = undefined): any {
    const path = this.app.workspace.getActiveFile().path;
    const cache = this.app.metadataCache.getCache(path);

    let value = defaultValue;
    if (cache?.frontmatter && cache.frontmatter.hasOwnProperty(key)) {
        value = cache.frontmatter[key];
    }
    return value;
  }
}
