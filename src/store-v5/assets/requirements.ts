import type {Site} from '../compiler/types';

export type ImageRequirement={ownerRef:string;kind:string;assetId?:string;path:string};

/** The render tree is the source of required media. Optional sections create no slots. */
export function imageRequirements(site:Site):ImageRequirement[]{
 const required:ImageRequirement[]=[];
 for(const section of site.layout.sections){
  if(section.type==='header')required.push({ownerRef:'header',kind:'brand.logo',assetId:site.assets.find(a=>a.ownerRef==='header'&&a.kind==='brand.logo')?.assetId,path:`/layout/sections/${section.id}`});
  if(section.type==='hero')required.push({ownerRef:section.id,kind:'hero.banner',assetId:section.assetId,path:`/layout/sections/${section.id}/assetId`});
  if(section.type==='booking')required.push({ownerRef:section.id,kind:'service.photo',assetId:section.assetId,path:`/layout/sections/${section.id}/assetId`});
  if(section.type==='kitBuilder')required.push({ownerRef:section.id,kind:'pet.portrait',assetId:section.pet?.assetId,path:`/layout/sections/${section.id}/pet/assetId`});
  if(section.type==='story')required.push({ownerRef:section.id,kind:'editorial.story',assetId:section.assetId,path:`/layout/sections/${section.id}/assetId`});
  if(section.type==='categoryTiles')for(const category of site.categories)required.push({ownerRef:category.id,kind:'category.tile',assetId:category.assetId,path:`/categories/${category.id}/assetId`});
 }
 if(site.layout.sections.some(s=>['catalog','kitBuilder','recommendations'].includes(s.type)))for(const product of site.products)for(const [i,media] of product.media.entries())required.push({ownerRef:product.sku,kind:media.kind||(i===0?'product.cutout':'product.detail'),assetId:media.assetId,path:`/products/${product.sku}/media/${i}/assetId`});
 return required;
}
