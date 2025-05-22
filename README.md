### Step 1: Install TypeScript and Node.js Types

You need to install TypeScript and the types for Node.js. You can do this using npm:

```bash
npm install typescript @types/node --save-dev
```

### Step 2: Initialize TypeScript Configuration

Next, you need to create a TypeScript configuration file (`tsconfig.json`). You can do this manually or by using the TypeScript CLI.

To create it manually, create a file named `tsconfig.json` in the root of your project and add the following configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",                // Specify ECMAScript target version
    "module": "commonjs",              // Specify module code generation
    "outDir": "./dist",                // Redirect output structure to the dist folder
    "rootDir": "./src",                // Specify the root directory of input files
    "strict": true,                     // Enable all strict type-checking options
    "esModuleInterop": true,            // Enables emit interoperability between CommonJS and ES Modules
    "skipLibCheck": true,               // Skip type checking of declaration files
    "forceConsistentCasingInFileNames": true // Disallow inconsistently-cased references to the same file
  },
  "include": ["src/**/*"],              // Include all TypeScript files in the src directory
  "exclude": ["node_modules", "dist"]   // Exclude node_modules and dist directories
}
```

Alternatively, you can generate a default `tsconfig.json` file using the TypeScript CLI:

```bash
npx tsc --init
```

This will create a `tsconfig.json` file with default settings, which you can then modify as needed.

### Step 3: Create Project Structure

Create a directory structure for your project. A common structure is:

```
/your-project
  ├── /src
  │   └── index.ts
  ├── /dist
  ├── package.json
  ├── package-lock.json
  └── tsconfig.json
```

### Step 4: Write Your TypeScript Code

Create a file named `index.ts` in the `src` directory and write some TypeScript code. For example:

```typescript
// src/index.ts
const greeting: string = "Hello, TypeScript!";
console.log(greeting);
```

### Step 5: Add Build and Start Scripts

Update your `package.json` to include scripts for building and running your TypeScript code. Add the following under the `"scripts"` section:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js"
}
```

### Step 6: Build and Run Your Project

Now you can build your TypeScript code and run your Node.js application:

1. Build the project:

   ```bash
   npm run build
   ```

   This will compile your TypeScript files from the `src` directory into JavaScript files in the `dist` directory.

2. Run the application:

   ```bash
   npm start
   ```

### Step 7: (Optional) Install Additional Type Definitions

If you are using any libraries that require type definitions, you can install them using npm. For example, if you are using Express, you would install it like this:

```bash
npm install express
npm install @types/express --save-dev
```

### Conclusion

You now have a basic TypeScript setup for your Node.js project. You can expand upon this by adding more TypeScript files, using additional libraries, and configuring your project further as needed.