import type {CartLine,Product,Variant,Site} from '../compiler/types';
export const lineKey=(sku:string,variantSku?:string)=>`${sku}::${variantSku||''}`;
export function addLine(lines:CartLine[],p:Product,v:Variant|undefined,qty:number,maxPerItem:number):CartLine[]{
 const key=lineKey(p.sku,v?.sku),found=lines.find(x=>x.key===key),stock=v?.stock??p.stock;
 const next=Math.min(stock,maxPerItem,(found?.quantity||0)+qty);
 if(next<1)return lines;
 const line:CartLine={key,sku:p.sku,variantSku:v?.sku,variantLabel:v?.label,name:p.name,priceCents:v?.priceCents??p.priceCents,quantity:next,stock};
 return found?lines.map(x=>x.key===key?line:x):[...lines,line];
}
export const subtotal=(lines:CartLine[])=>lines.reduce((a,x)=>a+x.priceCents*x.quantity,0);
export function total(lines:CartLine[],rules:Site['rules']){return Math.max(0,subtotal(lines)-(rules.discountCents||0))+(lines.length?rules.shippingCents||0:0)}
export function migrate(lines:CartLine[],site:Site){return lines.flatMap(x=>{const p=site.products.find(p=>p.sku===x.sku);if(!p)return [];const v=x.variantSku?p.variants?.find(v=>v.sku===x.variantSku):undefined;if(x.variantSku&&!v)return [];const stock=v?.stock??p.stock,q=Math.min(x.quantity,stock,site.rules.maxPerItem||stock);return q>0?[{...x,name:p.name,priceCents:v?.priceCents??p.priceCents,stock,quantity:q}]:[]})}
