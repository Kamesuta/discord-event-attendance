/* eslint-disable @typescript-eslint/explicit-function-return-type */
const config = {
  '{src,test}/**/*.{js,ts}': 'eslint --cache --fix',
  '{src,test}/**': 'prettier --write',
  '{src,test}/**/*.ts': () => 'tsc --noEmit',
};

export default config;
