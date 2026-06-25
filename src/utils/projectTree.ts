export interface TreeNode {
  id: string;
  name: string;
  parentId?: string | null;
  children?: TreeNode[];
  [key: string]: unknown;
}

export function buildTree<T extends TreeNode>(items: T[]): T[] {
  const map = new Map<string, T & { children: T[] }>();
  const roots: (T & { children: T[] })[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }
  return roots as T[];
}

export interface ProjectSelectNode {
  id: string;
  name: string;
  level: string;
  parentId?: string | null;
  children?: ProjectSelectNode[];
}

export function buildProjectSelectTree(projects: ProjectSelectNode[]): ProjectSelectNode[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildTree(projects as any) as unknown as ProjectSelectNode[];
}

export function flattenTree<T extends TreeNode>(tree: T[]): T[] {
  const result: T[] = [];
  function walk(nodes: T[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) walk(node.children as T[]);
    }
  }
  walk(tree);
  return result;
}
