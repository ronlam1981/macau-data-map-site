export function storyShareText(title, storyId, pageUrl) {
  const link = new URL(pageUrl);
  link.search = '';
  link.hash = '';
  link.searchParams.set('story', storyId);
  return `${link.href}\n《${title}》\n數字看澳門｜網站策劃及製作：林宇滔`;
}
