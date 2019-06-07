const fs = require('fs').promises;
const path = require('path');
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

/**
 * getFiles returns a list of all files in a directory path {dirPath}
 * that match a given file extension {fileExt} (optional).
 */
const getFiles = async (dirPath, fileExt = '') => {
  // List all the entries in the directory.
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  return (
    dirents
      // Omit any sub-directories.
      .filter(dirent => dirent.isFile())
      // Ensure the file extension matches a given extension (optional).
      .filter(dirent =>
        fileExt.length ? dirent.name.toLowerCase().endsWith(fileExt) : true
      )
      // Return a list of file names.
      .map(dirent => dirent.name)
  );
};

// removeFiles deletes all files in a directory that match a file extension.
const removeFiles = async (dirPath, fileExt) => {
  // Get a list of all files in the directory.
  const fileNames = await getFiles(dirPath, fileExt);

  // Create a list of files to remove.
  const filesToRemove = fileNames.map(fileName =>
    fs.unlink(path.resolve(dirPath, fileName))
  );

  return Promise.all(filesToRemove);
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
 * getPosts lists and reads all the Markdown files in the posts directory,
 * returning a list of post objects after parsing the file contents.
 */
const getPosts = async dirPath => {
  // Get a list of all Markdown files in the directory.
  const fileNames = await getFiles(dirPath, '.md');

  // Create a list of files to read.
  const filesToRead = fileNames.map(fileName =>
    fs.readFile(path.resolve(dirPath, fileName), 'utf-8')
  );

  // Asynchronously read all the file contents.
  const fileData = await Promise.all(filesToRead);

  return fileNames.map((fileName, i) => parsePost(fileName, fileData[i]));
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

// getTemplatePath creates a file path to an HTML template file.
const getTemplatePath = name =>
  path.resolve(__dirname, 'templates', path.format({ name, ext: '.njk' }));

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
  // Ensure the public directory exists.
  await fs.mkdir(publicDirPath, { recursive: true });
  // Delete any previously-generated HTML files in the public directory.
  await removeFiles(publicDirPath, '.html');

  // Get all the Markdown files in the posts directory.
  const posts = await getPosts(postsDirPath);

  // Generate pages for all posts that are public.
  const postsToCreate = posts
    .filter(post => Boolean(post.public))
    .map(post => createPostFile(post));

  const createdPosts = await Promise.all(postsToCreate);

  // Generate a page with a list of posts.
  await createIndexFile(
    // Sort created posts by publish date (newest first).
    createdPosts.sort((a, b) => new Date(b.date) - new Date(a.date))
  );

  return createdPosts;
};

build()
  .then(created =>
    console.log(`Build successful. Generated ${created.length} post(s).`)
  )
  .catch(err => console.error(err));
