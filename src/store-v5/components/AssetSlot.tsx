import {useEffect,useState} from 'react';
import type {Asset} from '../compiler/types';
import type {Override} from '../assets/export';
import slotRegistry from '../assets/slot-registry.json' with { type: 'json' };

type Props={asset?:Asset;override?:Override;onAsset:(a:Asset)=>void;compact?:boolean};
export function AssetSlot({asset,override,onAsset,compact=false}:Props){
 const src=override?.url||(asset?.status==='ready'&&asset.approved?asset.url:undefined);
 const [broken,setBroken]=useState(false);
 useEffect(()=>setBroken(false),[src]);
 if(!asset)return null;
 const definition=(slotRegistry as Record<string,{width:number;height:number;fit:string}>)[asset.kind||''];
 const dims=`${asset.width||definition?.width||1024} × ${asset.height||definition?.height||1024} px`;
 return <div className={`asset-slot ${compact?'compact':''} ${!src||broken?'needs-asset':''}`} data-asset-id={asset.assetId}>
  {src&&!broken?<img src={src} alt={override?.alt||asset.alt||asset.ownerRef} loading="lazy" style={{objectFit:definition?.fit==='cover'?'cover':'contain'}} onError={()=>setBroken(true)}/>:<div className="asset-empty" aria-label={`Imagem pendente: ${asset.assetId}`}>
   <svg viewBox="0 0 56 48" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="2" y="2" width="52" height="44" rx="5"/><circle cx="39" cy="14" r="4"/><path d="M5 39 18 25l9 9 8-8 16 15"/></svg>
   {!compact&&<><strong>IMAGEM PENDENTE</strong><span>{asset.assetId}</span><small>{asset.kind} · {dims}</small></>}
  </div>}
  <button className="slot-action" type="button" onClick={()=>onAsset(asset)} aria-label={`${src&&!broken?'Trocar':'Adicionar'} imagem ${asset.assetId}`}>{src&&!broken?'Trocar imagem':'Adicionar imagem'}</button>
 </div>;
}
