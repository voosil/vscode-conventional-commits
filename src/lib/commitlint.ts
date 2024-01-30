/**
 * @since 2020-04-28 14:37
 * @author vivaxy
 */
import load from '@commitlint/load/lib/load';
import rules from '@commitlint/rules';
import { RulesConfig, RuleConfigSeverity } from '@commitlint/types/lib/rules';
import { PromptConfig } from '@commitlint/types/lib/prompt';
import { Commit } from '@commitlint/types/lib/parse';
import * as output from './output';
import { ConfigForPlugin, ScopeCls } from './scope-cls';

type DeepPartial<T> = {
  [P in keyof T]?: {
    [K in keyof T[P]]?: T[P][K];
  };
};

// type ScopeRuleConfig = [RuleConfigSeverity, 'never' | 'always', string[]];

interface CustomPrompt extends DeepPartial<PromptConfig> {
  forVscodePlugin: {
    ConventionalCommitPlugin: ConfigForPlugin;
  };
}

class Commitlint {
  private ruleConfigs: Partial<RulesConfig> = {};
  private promptConfigs: PromptConfig = {} as PromptConfig;
  private pluginConfig: ConfigForPlugin = {} as ConfigForPlugin;
  private scopeClsIns: ScopeCls | undefined;

  async loadRuleConfigs(cwd: string): Promise<Partial<RulesConfig>> {
    async function getRuleConfigs() {
      try {
        const { rules, prompt } = await load({}, { cwd });
        const customPrompt = prompt as CustomPrompt;
        output.info('Load commitlint configuration successfully.');
        return {
          rules,
          prompt,
          pluginConfig: customPrompt?.forVscodePlugin?.ConventionalCommitPlugin,
        };
      } catch (e) {
        // Catch if `Cannot find module "@commitlint/config-conventional"` happens.
        if (e.message.startsWith('Cannot find module')) {
          output.warning(`commitlint: The cwd is ${cwd}`);
          output.warning(`commitlint: ${e.message}`);
        } else {
          output.error('commitlint', `The cwd is ${cwd}`);
          // Not break even if it gets configuration failure.
          output.error('commitlint', e);
        }
        return {};
      }
    }
    const { rules, prompt, pluginConfig } = await getRuleConfigs();
    this.ruleConfigs = rules as RulesConfig;
    this.promptConfigs = prompt as PromptConfig;
    this.pluginConfig = pluginConfig as ConfigForPlugin;
    this.scopeClsIns = new ScopeCls(this.promptConfigs, this.pluginConfig);

    return this.ruleConfigs;
  }

  private getEnum(key: keyof RulesConfig) {
    const config = this.ruleConfigs[key];
    if (!config) {
      return [];
    }
    // @ts-ignore
    const [level, condition, value] = config;
    // if (level !== RuleConfigSeverity.Error) {
    //   return [];
    // }
    if (condition === 'never') {
      return [];
    }
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(function (item) {
      return String(item);
    });
  }

  private lintRule(commit: Commit, key: keyof RulesConfig) {
    if (!this.ruleConfigs[key]) {
      return '';
    }
    // @ts-ignore
    const [level, condition, value] = this.ruleConfigs[key];
    if (level !== RuleConfigSeverity.Error) {
      return '';
    }
    // @ts-ignore
    const [valid, error] = rules[key](commit, condition, value);
    return valid ? '' : error;
  }

  private lintRules(commit: Commit, keys: (keyof RulesConfig)[]) {
    for (const key of keys) {
      const error = this.lintRule(commit, key);
      if (error) {
        return error;
      }
    }
    return '';
  }

  getTypeEnum() {
    return this.getEnum('type-enum');
  }

  getScopeEnum() {
    return this.getEnum('scope-enum');
  }

  getTypeDetail(type: string) {
    return this.promptConfigs.questions.type?.enum?.[type];
  }

  getScopeDetail(scope: string) {
    return this.promptConfigs.questions.scope?.enum?.[scope];
  }

  getSortedClassifiedScopeItems() {
    return this.scopeClsIns?.run() ?? [];
  }

  get promptSettings() {
    // @ts-ignore
    return this.promptConfigs.settings;
  }

  lintType(type: string) {
    return this.lintRules({ type } as Commit, [
      'type-enum',
      'type-case',
      'type-empty',
      'type-min-length',
      'type-max-length',
    ]);
  }

  lintScope(scope: string) {
    return this.lintRules({ scope } as Commit, [
      'scope-enum',
      'scope-case',
      'scope-empty',
      'scope-max-length',
      'scope-min-length',
    ]);
  }

  lintSubject(subject: string) {
    return this.lintRules({ subject } as Commit, [
      'subject-case',
      'subject-empty',
      'subject-full-stop',
      'subject-min-length',
      'subject-max-length',
    ]);
  }

  lintHeader(header: string) {
    return this.lintRules({ header } as Commit, [
      'header-case',
      'header-full-stop',
      'header-max-length',
      'header-min-length',
    ]);
  }

  lintBody(body: string) {
    return this.lintRules({ body } as Commit, [
      'body-full-stop',
      'body-min-length',
      'body-max-length',
    ]);
  }

  lintFooter(footer: string) {
    return this.lintRules({ footer } as Commit, [
      'footer-min-length',
      'footer-max-length',
    ]);
  }

  canScopeBeEmpty() {
    const scopeEmptyRule = this.ruleConfigs?.['scope-empty'] as [
      number,
      string,
    ];
    if (
      scopeEmptyRule &&
      scopeEmptyRule[1] === 'never' &&
      scopeEmptyRule[0] === 2
    )
      return false;
    return true;
  }
}

export default new Commitlint();
