import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const REPO_OWNER = 'locutus75';
const REPO_NAME = 'e-co.store';
const REPO_BRANCH = 'master';

export async function GET() {
  try {
    // 1. Get Local Commit Hash
    let localHash = '';
    let localMessage = '';
    let localDate = '';
    let localAuthor = '';
    try {
      localHash = execSync('git rev-parse HEAD').toString().trim();
      localMessage = execSync('git log -1 --pretty=%B').toString().trim();
      localDate = execSync('git log -1 --format=%cd').toString().trim();
      localAuthor = execSync('git log -1 --format=%an').toString().trim();
    } catch (e) {
      console.warn("Could not get local git commit:", e);
      localHash = 'Unknown';
    }

    // 2. Get Remote Commit Hash from GitHub API
    let remoteHash = '';
    let remoteMessage = '';
    let remoteDate = '';
    let remoteAuthor = '';
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`,
        {
          headers: {
            'User-Agent': 'e-co.store-updater',
            'Accept': 'application/vnd.github.v3+json'
          },
          // Cache control to ensure we hit the API fresh
          cache: 'no-store'
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        remoteHash = data.sha;
        remoteMessage = data.commit.message;
        remoteDate = data.commit.author.date;
        remoteAuthor = data.commit.author.name;
      } else {
        console.warn("GitHub API error:", response.statusText);
      }
    } catch (e) {
      console.error("Error fetching remote commit:", e);
    }

    // 3. Compare
    const updateAvailable = remoteHash && localHash && remoteHash !== localHash;

    return NextResponse.json({
      localHash,
      localMessage,
      localDate,
      localAuthor,
      remoteHash,
      remoteMessage,
      remoteDate,
      remoteAuthor,
      updateAvailable,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in update check:", error);
    return NextResponse.json({ error: "Failed to check for updates" }, { status: 500 });
  }
}
