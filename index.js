const fs = require('fs').promises;
const path = require('path');
const del = require('del');
const frontMatter = require('front-matter');
const remark = require('remark');
const remarkHTML = require('remark-html');
const remarkSlug = require('remark-slug');
const remarkHighlight = require('remark-highlight.js');
const nunjucks = require('nunjucks');

// Store a reference to the source directory.
const postsDirPath = path.resolve(__dirname, 'posts');
// Store a reference path to the destination directory.
const publicDirPath = path.resolve(__dirname, 'public');

// getTemplatePath creates a file path to an HTML template file.
const getTemplatePath = name =>
  path.resolve(__dirname, 'templates', path.format({ name, ext: '.njk' }));

// emptyDir deletes a directory and re-creates it.
const emptyDir = async dirPath => {
  await del(dirPath);
  await fs.mkdir(dirPath, { recursive: true });
};

/**
 * parsePost consumes the file name and file content and returns a post
 * object with separate front matter (meta), post body and slug.
 */
const parsePost = (fileName, fileData) => {
  // Strip the extension from the file name to get a slug.
  const slug = path.basename(fileName, '.md');
  // Split the file content into the front matter (attributes) and post body.
  const { attributes, body } = frontMatter(fileData);

  return { ...attributes, body, slug };
};

/**
 * getPosts lists and reads all the Markdown files in a directory,
 * any files in sub-directories are ignored for simplicity's sake.
 */
const getPosts = async dirPath => {
  // List all the entries in the directory.
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  // Get a list of all Markdown files, omitting any sub-directories.
  const fileNames = dirents
    .filter(dirent => dirent.isFile())
    .filter(dirent => dirent.name.toLowerCase().endsWith('.md'))
    .map(dirent => dirent.name);

  // Asynchronously read all the file contents.
  const filesToRead = fileNames.map(fileName =>
    fs.readFile(path.resolve(dirPath, fileName), 'utf-8')
  );
  const fileData = await Promise.all(filesToRead);

  return fileNames.map((fileName, i) =>
    parsePost(fileName, fileData[i].toString())
  );
};

/**
 * markdownToHTML converts Markdown text to HTML.
 * Adds links to headings, and code syntax highlighting.
 */
const markdownToHTML = text =>
  new Promise((resolve, reject) =>
    remark()
      .use(remarkHTML)
      .use(remarkSlug)
      .use(remarkHighlight)
      .process(text, (err, file) =>
        err ? reject(err) : resolve(file.contents)
      )
  );

/**
 * createPostFile generates a new HTML page from a template and saves the file.
 * It also converts the post body from Markdown to HTML.
 */
const createPostFile = async post => {
  // Use the template engine to generate the file content.
  const fileData = nunjucks.render(getTemplatePath('post'), {
    ...post,
    // Convert Markdown to HTML.
    body: await markdownToHTML(post.body)
  });

  // Combine the slug and file extension to create a file name.
  const fileName = path.format({ name: post.slug, ext: '.html' });
  // Create a file path in the destination directory.
  const filePath = path.resolve(publicDirPath, fileName);

  // Save the file in the desired location.
  await fs.writeFile(filePath, fileData, 'utf-8');

  return post;
};

/**
 * createIndexFile generates an index file with a list of blog posts.
 */
const createIndexFile = async posts => {
  // Use the template engine to generate the file content.
  const fileData = nunjucks.render(getTemplatePath('index'), { posts });
  // Create a file path in the destination directory.
  const filePath = path.resolve(publicDirPath, 'index.html');

  // Save the file in the desired location.
  await fs.writeFile(filePath, fileData, 'utf-8');
};

// build runs the static site generator.
const build = async () => {
  // Ensure destination directory exists and is empty.
  await emptyDir(publicDirPath);

  // Get all the Markdown files in the posts directory.
  const posts = await getPosts(postsDirPath);

  // Generate pages for all posts that are public.
  const postsToCreate = posts
    .filter(post => Boolean(post.public))
    .map(post => createPostFile(post));

  const createdPosts = await Promise.all(postsToCreate);

  // Generate a page with a list of posts.
  await createIndexFile(
    // Sort created posts by publish date.
    createdPosts.sort((a, b) => new Date(a.date) - new Date(b.date))
  );

  return createdPosts;
};

build()
  .then(created =>
    console.log(`Build successful. Generated ${created.length} post(s).`)
  )
  .catch(err => console.error(err));
