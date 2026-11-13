import type {Asset,SiteIR} from '../compiler/types';
import {promptFor} from './prompts';
import JSZip from 'jszip';
import type {Override} from './export';

export const MAX_BATCH_SIZE=10;
export function promptBatches(site:SiteIR,assetIds:string[]){
 const unique=[...new Set(assetIds)].filter(id=>!!site.assetIndex[id]);
 return Array.from({length:Math.ceil(unique.length/MAX_BATCH_SIZE)},(_,index)=>unique.slice(index*MAX_BATCH_SIZE,(index+1)*MAX_BATCH_SIZE).map(id=>site.assetIndex[id]));
}
export function batchPrompt(site:SiteIR,assets:Asset[],batchIndex:number){
 if(!assets.length)throw new Error('Selecione ao menos um asset.');
 if(assets.length>MAX_BATCH_SIZE)throw new Error('Cada execução aceita no máximo 10 assets.');
 const num=String(batchIndex+1).padStart(2,'0');
 const intro=`<orquestrador_lote>\nGere exatamente ${assets.length} imagens SEPARADAS, uma por LOTE abaixo e um único componente por imagem. Não junte componentes em uma prancha e não monte fundos com peças isoladas. Para hero, background e fotografia, gere a cena completa descrita em uma imagem única, sem interface ou texto. Preserve cada nome de arquivo exatamente como indicado. Entregue os ${assets.length} arquivos e reúna-os em um ZIP chamado assets-gerados-lote-${num}.zip. Se não houver ferramenta de geração ou compactação, declare o bloqueio e entregue apenas os prompts, sem fingir que gerou arquivos.\n</orquestrador_lote>\n`;
 return intro+'\n'+assets.map((asset,i)=>{
  const prompt=site.promptIndex[asset.assetId];const filename=`${asset.assetId}.png`;
  return `LOTE ${String(batchIndex*MAX_BATCH_SIZE+i+1).padStart(2,'0')} — 1 COMPONENTE\n\n1. ${filename}\n\nPROMPT PARA GERAR A IMAGEM:\n\n${promptFor(asset,site)}\n\nCONFIGURAÇÃO:\n- Formato: ${asset.ratio}\n- Estrutura: asset único\n- Fundo: ${prompt.generationScope==='full_scene'?'cenário completo em uma imagem':'conforme prompt do asset'}\n- Dimensão: ${prompt.width} × ${prompt.height} px\n- Recorte posterior: não\n- Arquivo de saída: ${filename}`;
 }).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
}
export function matchAssetFilename(filename:string,assetIds:string[]){
 const base=filename.split(/[\\/]/).at(-1)?.replace(/\.(png|jpe?g|webp|avif)$/i,'')||'';
 return assetIds.find(id=>id.toLocaleLowerCase()===base.toLocaleLowerCase());
}

export async function exportAssetImages(site:SiteIR,overrides:Record<string,Override>){
 const zip=new JSZip(),included:string[]=[];
 for(const asset of site.assets){
  const url=overrides[asset.assetId]?.url||(asset.status==='ready'&&asset.approved?asset.url:'');
  const match=url?.match(/^data:image\/(png|jpeg|webp|avif);base64,(.+)$/);
  if(!match)continue;
  const ext=match[1]==='jpeg'?'jpg':match[1];
  zip.file(`${asset.assetId}.${ext}`,match[2],{base64:true});included.push(asset.assetId);
 }
 if(!included.length)throw new Error('Nenhuma imagem local aplicada para exportar.');
 zip.file('asset-manifest.json',JSON.stringify({project:site.business.name,assetIds:included},null,2));
 return zip.generateAsync({type:'blob'});
}
