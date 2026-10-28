export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.ignores.add("assets/**/*.md");
  eleventyConfig.ignores.add("content/r3-*.md");
  eleventyConfig.addFilter("money", (n) => "$" + n);
  return {
    pathPrefix: "/serene-desk/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dir: { input: ".", output: "_site", includes: "_includes", data: "data" },
  };
}
