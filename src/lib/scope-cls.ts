import { PromptConfig } from '@commitlint/types/lib/prompt';
import { Item } from './prompts/prompt-types';
import { set } from 'lodash';

export interface ConfigForPlugin {
  // scope在列表中显示的优先级，值越小优先级越高
  scopeListOrder?: string[];
  // scope分类标识符
  scopeClassificationKey?: string;
  // 如果没有指定scope属于哪类，将使用下述分类
  unclassifiedName?: string;
}

export type CustomScope = {
  description?: string | undefined;
  title?: string | undefined;
  emoji?: string | undefined;
} & { [K in string]?: string | undefined };

export type ScopeItem = Item & { cls: [string, number] };

const DefaultClsKey = 'title';
const DefaultUnclassifiedName = 'custom';
const UnknownScopeType = 'unknown scope type';

export class ScopeCls {
  prompt: PromptConfig;
  pluginConfig?: ConfigForPlugin;

  constructor(prompt: PromptConfig, pluginConfig?: ConfigForPlugin) {
    this.prompt = prompt;
    this.pluginConfig = pluginConfig;
  }

  get scopeClassificationKey() {
    return this.pluginConfig?.scopeClassificationKey ?? DefaultClsKey;
  }

  get scopeListOrder() {
    return this.pluginConfig?.scopeListOrder ?? [];
  }

  get unclassifiedName() {
    return this.pluginConfig?.unclassifiedName ?? DefaultUnclassifiedName;
  }

  get scope() {
    set(
      this.prompt,
      'questions.scope.enum',
      this.prompt?.questions?.scope?.enum ?? {},
    );

    return this.prompt?.questions.scope!.enum!;
  }

  /**
   * 为本地未设置分类项的scope设置缺省值
   */
  setScopeUnclassifiedTitleName() {
    for (const v of Object.values(this.scope))
      !!(v as CustomScope)[this.scopeClassificationKey] ||
        ((v as CustomScope)[
          this.scopeClassificationKey
        ] = this.unclassifiedName);
  }

  /**
   * 对scope按照配置项排序
   */
  sortScope(): Item[] {
    const res: Item[] = [];
    let curCls: string;
    for (const cls of this.scopeListOrder) {
      Object.entries(this.scope).forEach(([scope, scopeEnum]) => {
        const scopeCls = (scopeEnum as CustomScope)[
          this.scopeClassificationKey
        ];
        if (scopeCls === cls) {
          if (scopeCls !== curCls) {
            res.push({ label: scopeCls, kind: -1 });
            curCls = scopeCls;
          }
          res.push({
            label: scope,
            cls,
            description: '',
            detail: scopeEnum.description ?? '',
          });
        }
      });
    }
    const unhandledScopeItems = this.checkIfScopeInOrderList();

    return [...res, ...unhandledScopeItems];
  }

  checkIfScopeInOrderList() {
    const unhandledScopes: string[] = [];
    const unhandledScopeItems: Item[] = [];
    Object.entries(this.scope).forEach(([scopeName, scopeEnum]) => {
      const cls = (scopeEnum as CustomScope)[this.scopeClassificationKey];
      if (!cls || !this.scopeListOrder.includes(cls)) {
        if (!unhandledScopeItems.length) {
          unhandledScopeItems.push({ label: UnknownScopeType, kind: -1 });
        }
        unhandledScopeItems.push({
          label: scopeName,
          cls: UnknownScopeType,
          description: '',
          detail: scopeEnum.description ?? '',
        });
        unhandledScopes.push(scopeName);
      }
    });
    unhandledScopes.length > 0 &&
      console.warn(
        'Scope types not in scopeListOrder:',
        unhandledScopes.join(','),
      );
    return unhandledScopeItems;
  }

  run() {
    this.setScopeUnclassifiedTitleName();
    return this.sortScope();
  }
}
