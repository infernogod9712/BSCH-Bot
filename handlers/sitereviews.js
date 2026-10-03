// handlers/sitereviews.js
// Puts a client's review on the website. The site is built from
// site/src/reviews.json in the GitHub repo, so the bot commits the new review
// there through GitHub's API. It never edits the file on the Pi itself:
// git-sync stops updating if a tracked file changes locally, and the next pull
// brings the commit down anyway.
//
// Needs GITHUB_TOKEN in .env: a fine-grained token with "Contents: Read and
// write" on the BSCH-Bot repo only.

const REPO = process.env.GITHUB_REPO || 'infernogod9712/BSCH-Bot';
const BRANCH = process.env.GITHUB_BRANCH || 'master';
const FILE = 'site/src/reviews.json';

function canPublish() {
  return Boolean(process.env.GITHUB_TOKEN);
}

async function github(method, body) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'BSCH-Bot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

// Adds one review to the front of reviews.json. Retries once if someone else
// committed the file in between (GitHub answers 409 on a stale sha).
async function publishReview(review, attempt = 1) {
  const current = await github('GET');
  const reviews = JSON.parse(Buffer.from(current.content, 'base64').toString('utf-8'));
  reviews.unshift(review);

  try {
    await github('PUT', {
      message: `Site: add a ${review.score}/10 client review`,
      content: Buffer.from(JSON.stringify(reviews, null, 2) + '\n').toString('base64'),
      sha: current.sha,
      branch: BRANCH,
      committer: { name: 'infernogod9712', email: 'infernogod9712@users.noreply.github.com' },
    });
  } catch (e) {
    if (attempt === 1 && /409/.test(e.message)) return publishReview(review, 2);
    throw e;
  }
}

module.exports = { canPublish, publishReview };
