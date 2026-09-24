import {handle} from '@/lib/community/http.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:Request,ctx:{params:Promise<{action:string}>}){return handle(req,(await ctx.params).action);}
export async function POST(req:Request,ctx:{params:Promise<{action:string}>}){return handle(req,(await ctx.params).action);}
