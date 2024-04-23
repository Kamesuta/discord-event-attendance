# Robust TypeScript Template with eslint for Node.js

This is a template for creating robust and reliable TypeScript projects with Node.js.  
It is ready to be used with VSCode, which allows you to run and debug your code with ease.  
It also uses eslint and prettier to enforce strict coding standards and format the code automatically.  
Moreover, it runs linting and formatting on every commit to ensure consistent and safe code quality.  

## Features
- **VSCode ready** feature that allows you to run and debug your code with just F5. You can also use breakpoints to inspect your code. There is also a launch configuration for terminal debugging if you need console input.
- **eslint** is configured with strict rules to help you write robust code.
  - It has auto-fix feature that will **fix** your code for quotation marks, spaces after comments, etc.
  - It requires you to write return types and JsDoc comments for better readability and documentation.
- **prettier** will format your code automatically according to the predefined style.
- **husky** and **lint-staged** will run linting and formatting on every commit, so you can always commit safe code.
- **Common features** such as logging and configuration are already implemented for your convenience.
- **Simple and minimal** design that only uses log and config as the basic libraries. You can easily extend the template with your own dependencies and features.
- **ESM** import syntax is enabled by default, so you can use `import` and `export` statements instead of `require` and `module.exports`.

## How to use

To use this template, you need to have Node.js installed on your machine. Then, follow these steps:

1. Clone this repository or download it as a ZIP file.
2. Run `npm install` to install the dependencies.
3. Run `npm run start` to run your code.
4. Edit the files in the `src` folder as you wish.
5. Run `npm run build` to compile your code into the `dist` folder.
6. Run `npm run lint` to check your code for errors.
7. Run `npm run prettier` to format your code automatically.
