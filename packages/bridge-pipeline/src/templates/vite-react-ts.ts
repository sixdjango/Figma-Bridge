/**
 * Vite React TypeScript template generator
 */

import type { ReactRenderResult, ImportStatement } from '../pipeline/react-renderer';

export type ViteTemplateOptions = {
  /** Project name */
  projectName: string;
  /** Use Tailwind CSS */
  useTailwind?: boolean;
  /** Base font size for rem (default: 100) */
  remBase?: number;
};

export type ViteTemplateFile = {
  path: string;
  content: string;
};

/**
 * Generate package.json
 */
function generatePackageJson(options: ViteTemplateOptions): string {
  const pkg = {
    name: options.projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      lint: 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      '@typescript-eslint/eslint-plugin': '^6.0.0',
      '@typescript-eslint/parser': '^6.0.0',
      '@vitejs/plugin-react': '^4.0.0',
      eslint: '^8.45.0',
      'eslint-plugin-react-hooks': '^4.6.0',
      'eslint-plugin-react-refresh': '^0.4.0',
      typescript: '^5.0.0',
      vite: '^5.0.0',
      ...(options.useTailwind
        ? {
            tailwindcss: '^3.4.0',
            postcss: '^8.4.0',
            autoprefixer: '^10.4.0',
          }
        : {}),
    },
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * Generate vite.config.ts
 */
function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: './postcss.config.js',
  },
});
`;
}

/**
 * Generate tsconfig.json
 */
function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      baseUrl: '.',
      paths: {
        '@/*': ['src/*'],
      },
    },
    include: ['src'],
    references: [{ path: './tsconfig.node.json' }],
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate tsconfig.node.json
 */
function generateTsConfigNode(): string {
  const config = {
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowSyntheticDefaultImports: true,
    },
    include: ['vite.config.ts'],
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate index.html
 */
function generateIndexHtml(options: ViteTemplateOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${options.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

/**
 * Generate main.tsx
 */
function generateMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

/**
 * Generate App.tsx wrapper
 */
function generateAppTsx(componentName: string): string {
  return `import { ${componentName} } from './components/${componentName}';

function App() {
  return (
    <div className="app">
      <${componentName} />
    </div>
  );
}

export default App;
`;
}

/**
 * Generate index.css with rem base
 */
function generateIndexCss(options: ViteTemplateOptions): string {
  const remBase = options.remBase || 100;

  let css = `/* Base styles */
:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  font-size: ${remBase}px; /* 1rem = ${remBase}px */

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
}

.app {
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
}

.figma-component {
  position: relative;
}
`;

  if (options.useTailwind) {
    css = `@tailwind base;
@tailwind components;
@tailwind utilities;

${css}`;
  }

  return css;
}

/**
 * Generate tailwind.config.js
 */
function generateTailwindConfig(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`;
}

/**
 * Generate postcss.config.js
 */
function generatePostCssConfig(useTailwind: boolean): string {
  if (useTailwind) {
    return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
  }

  return `export default {
  plugins: {
    autoprefixer: {},
  },
}
`;
}

/**
 * Generate .gitignore
 */
function generateGitIgnore(): string {
  return `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`;
}

/**
 * Format import statements for TypeScript
 */
function formatImportsTs(imports: ImportStatement[]): string {
  return imports.map(imp => {
    const parts: string[] = [];
    if (imp.defaultImport) {
      parts.push(imp.defaultImport);
    }
    if (imp.namedImports.length > 0) {
      parts.push(`{ ${imp.namedImports.join(', ')} }`);
    }
    return `import ${parts.join(', ')} from '${imp.from}';`;
  }).join('\n');
}

/**
 * Generate component file
 */
function generateComponentFile(result: ReactRenderResult): string {
  const importStatements = formatImportsTs(result.imports);

  const parts: string[] = [];

  // Add React import
  parts.push(`import React from 'react';`);

  // Add component imports
  if (importStatements) {
    parts.push(importStatements);
  }

  // Add CSS import
  parts.push(`import './styles.css';`);

  parts.push('');
  parts.push(result.jsx);
  parts.push('');

  return parts.join('\n');
}

/**
 * Generate all Vite React TS template files
 */
export function generateViteTemplate(
  result: ReactRenderResult,
  options: ViteTemplateOptions
): ViteTemplateFile[] {
  const files: ViteTemplateFile[] = [];

  // Root files
  files.push({ path: 'package.json', content: generatePackageJson(options) });
  files.push({ path: 'vite.config.ts', content: generateViteConfig() });
  files.push({ path: 'tsconfig.json', content: generateTsConfig() });
  files.push({ path: 'tsconfig.node.json', content: generateTsConfigNode() });
  files.push({ path: 'index.html', content: generateIndexHtml(options) });
  files.push({ path: '.gitignore', content: generateGitIgnore() });
  files.push({ path: 'postcss.config.js', content: generatePostCssConfig(options.useTailwind ?? false) });

  if (options.useTailwind) {
    files.push({ path: 'tailwind.config.js', content: generateTailwindConfig() });
  }

  // src files
  files.push({ path: 'src/main.tsx', content: generateMainTsx() });
  files.push({ path: 'src/App.tsx', content: generateAppTsx(result.componentName) });
  files.push({ path: 'src/index.css', content: generateIndexCss(options) });

  // Component files
  files.push({
    path: `src/components/${result.componentName}/index.tsx`,
    content: generateComponentFile(result),
  });
  files.push({
    path: `src/components/${result.componentName}/styles.css`,
    content: result.css,
  });

  return files;
}

/**
 * Generate only the component files (for adding to existing project)
 */
export function generateComponentFiles(
  result: ReactRenderResult
): ViteTemplateFile[] {
  const files: ViteTemplateFile[] = [];

  files.push({
    path: `${result.componentName}/index.tsx`,
    content: generateComponentFile(result),
  });
  files.push({
    path: `${result.componentName}/styles.css`,
    content: result.css,
  });

  return files;
}
