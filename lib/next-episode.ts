/**
 * «Далее» на S04. Следующий выпуск выбирается детерминированно — по тому же
 * порядку, в котором раздел показан человеку, а не по случайности и не по
 * «похожести». На последнем выпуске блока просто нет.
 *
 * Автоматический переход по окончании намеренно не включается: таймер сна и
 * эфир не должны сами запускать новый материал.
 */
export type Playable={id:string;kind:string;audioKey?:string|null;published:number};

/** list уже в том порядке, в котором раздел отображается. */
export function nextEpisode<T extends Playable>(list:T[],currentId:string):T|null{
 const playable=list.filter(p=>p.kind==='podcast'&&p.published===1&&!!p.audioKey);
 const at=playable.findIndex(p=>p.id===currentId);
 if(at<0)return null;
 return playable[at+1]??null;
}
