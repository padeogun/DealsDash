module.exports = {
  presets: [require("./src/design-system/tokens/tailwind.preset.js")],
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: { extend: {} },
  plugins: [],
};
