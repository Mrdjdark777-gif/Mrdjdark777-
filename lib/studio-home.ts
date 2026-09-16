/**
 * Что показывать автору на главной студии.
 *
 * Раньше там стояли те же три карточки настроек, что и на странице настроек,
 * и обе вкладки были неотличимы. Настройки задают раз и почти не трогают, а при
 * открытии студии автору нужно другое: что недоделано и что последним ушло к
 * слушателям.
 */
// published приходит из SQLite числом (0/1), поэтому читается по истинности.
export type WorkItem={id:string;kind:string;title:string;published:number|boolean;createdAt:number};
export const DRAFT_LIMIT=4,PUBLISHED_LIMIT=3;
export function workbench<T extends WorkItem>(items:readonly T[]){
 const byNewest=[...items].sort((a,b)=>b.createdAt-a.createdAt);
 return{
  drafts:byNewest.filter(p=>!p.published).slice(0,DRAFT_LIMIT),
  published:byNewest.filter(p=>p.published).slice(0,PUBLISHED_LIMIT),
  draftCount:items.filter(p=>!p.published).length,
 };
}
