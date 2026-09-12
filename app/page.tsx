import Studio from './studio';
// Static prerendering would freeze this shell with a long-lived cache header,
// so phones/native clients can get stuck showing a stale build after a
// redeploy (old markup with fresh CSS, or vice versa) until the cache expires.
export const dynamic = 'force-dynamic';
export default function Home(){return <Studio/>;}
