/**
 * Stories show app screens outside the product shell, so they carry the same marker the shell does:
 * text inside the app is a touch bolder than on the public site (see `data-app-text` in globals.css).
 */
export default function DevStoriesLayout({ children }: { children: React.ReactNode }) {
  return <div data-app-text>{children}</div>;
}
