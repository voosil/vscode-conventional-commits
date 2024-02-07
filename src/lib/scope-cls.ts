import path = require('path');
import { PromptConfig } from '@commitlint/types/lib/prompt';
import { Item } from './prompts/prompt-types';
import { set } from 'lodash';
import { workspace } from 'vscode';
import * as output from './output';
import * as configuration from './configuration';
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
      {
        ...this.prompt?.questions?.scope?.enum,
        ...(configuration.get('useNxScopes') ? this.getNxScopes() : {}),
      } ?? {},
    );

    return this.prompt?.questions.scope!.enum!;
  }

  // based on @commitlint/config-nx-scopes
  private getProjects(selector = (...args: any[]) => true) {
    const workspaceDir = workspace.workspaceFolders?.[0].uri.fsPath;
    const userSetNxdir = configuration.get<string>('nxdir');
    const nxdir = userSetNxdir || workspaceDir;

    if (!nxdir) {
      output.warning('Cannot resolve any workspace paths');
      return;
    }
    let FsTree, getNXProjects;
    try {
      //@ts-ignore
      const nxTree = __non_webpack_require__(
        path.resolve(nxdir, './node_modules/nx/src/generators/tree.js'),
      );
      //@ts-ignore
      const { getProjects } = __non_webpack_require__(
        path.resolve(
          nxdir,
          './node_modules/nx/src/generators/utils/project-configuration.js',
        ),
      );

      FsTree = nxTree.FsTree;
      getNXProjects = getProjects;
    } catch (e) {}

    if (!FsTree || !getNXProjects) {
      output.warning(
        'Cannot find nx module files in your workspace: nx/src/generators/tree.js or nx/src/generators/utils/project-configuration.js',
      );
      return;
    }

    const projects = getNXProjects(new FsTree(nxdir, false)) as Map<
      string,
      {
        projectType: string;
        tags: string[];
        targets: any;
      }
    >;

    return Array.from(projects.entries())
      .map(([name, project]) => ({
        name,
        ...project,
      }))
      .filter((project) =>
        selector({
          name: project.name,
          projectType: project.projectType,
          tags: project.tags,
        }),
      )
      .filter((project) => project.targets)
      .map((project) => project.name)
      .map((name) => (name.charAt(0) === '@' ? name.split('/')[1] : name));
  }

  getNxScopes() {
    const nxScopeEnum = {};

    //https://github.com/conventional-changelog/commitlint/blob/master/%40commitlint/config-nx-scopes/readme.md#filtering-projects
    //add nx projects names to scope
    this.getProjects(
      ({ name, projectType }: { name: string; projectType: string }) => {
        let testProject;
        if (name && name.indexOf('e2e') !== -1) testProject = 'test';
        const cls = projectType ?? testProject;

        if (!cls) {
          throw new Error(
            `[Commitlint nx scope error]scope title: [${name}] hasn't been added correctly`,
          );
        }

        // @ts-ignore
        nxScopeEnum[name] = {
          title: cls,
          description: '',
        };

        return true;
      },
    );

    return nxScopeEnum;
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
      output.warning(
        `Scope types not in scopeListOrder: ${unhandledScopes.join(',')}`,
      );
    return unhandledScopeItems;
  }

  run() {
    this.setScopeUnclassifiedTitleName();
    return this.sortScope();
  }
}
