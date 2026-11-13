import { useState } from 'react';
import {
  formatCurrencyBRL,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { analyzeInstagramProfile, parseSpreadsheetProducts } from '@/services/profile-service';
import { searchWebAssets } from '@/services/image-search';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Lock,
  MapPin,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface FichaWizardViewProps {
  initialProfile: BusinessProfile;
  revision: number;
  onSaveAndGenerate: (profile: BusinessProfile) => Promise<void>;
  onBackToDual?: () => void;
}

const STEPS = [
  { id: 1, key: 'negocio', label: '1. Negócio', icon: Building2 },
  { id: 2, key: 'contato', label: '2. Contato', icon: MapPin },
  { id: 3, key: 'pagamento', label: '3. Pagamento', icon: CreditCard },
  { id: 4, key: 'entrega', label: '4. Entrega', icon: Truck },
  { id: 5, key: 'atendente', label: '5. Atendente', icon: UserRound },
  { id: 6, key: 'marca', label: '6. Marca', icon: Sparkles },
  { id: 7, key: 'produtos', label: '7. Produtos', icon: Package },
];

export function FichaWizardView({
  initialProfile,
  revision,
  onSaveAndGenerate,
  onBackToDual,
}: FichaWizardViewProps) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<BusinessProfile>(() => structuredClone(initialProfile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Quick manual product entry state
  const [newProd, setNewProd] = useState({
    name: '',
    sku: '',
    price: '',
    stock: '10',
    category: 'Geral',
    variation: 'Padrão',
    description: '',
  });
  const [huntingId, setHuntingId] = useState<string | null>(null);
  const [huntCandidates, setHuntCandidates] = useState<Record<string, Array<{ url: string; title?: string }>>>({});
  const [analyzingInstagram, setAnalyzingInstagram] = useState(false);

  async function handleAnalyzeInstagram() {
    const raw = profile.brand.instagram.trim();
    if (!raw) {
      setError('Digite o @usuario do Instagram da loja antes de analisar.');
      return;
    }
    setError('');
    setNotice('');
    setAnalyzingInstagram(true);
    try {
      const res = await analyzeInstagramProfile(raw);
      setProfile(prev => {
        const currentName = prev.business.name.trim();
        const shouldFillName = !currentName || /^loja\s+companygen$/i.test(currentName) || /^minha\s+loja$/i.test(currentName);
        return {
          ...prev,
          business: {
            ...prev.business,
            name: shouldFillName && res.fullName ? res.fullName : prev.business.name,
            description: !prev.business.description.trim() && res.bio ? res.bio : prev.business.description,
          },
          brand: {
            ...prev.brand,
            instagram: res.handle || raw,
            logoUrl: res.logoUrl || prev.brand.logoUrl,
          },
        };
      });
      if (res.logoUrl) {
        setNotice(`Instagram ${res.handle} analisado (${res.source}): logo e dados importados!`);
      } else if (res.fullName || res.bio) {
        setNotice(`Instagram ${res.handle} analisado: texto importado (${res.error || 'sem foto pública'}).`);
      } else {
        setError(res.error || 'Não foi possível extrair os dados deste perfil.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao analisar Instagram.');
    } finally {
      setAnalyzingInstagram(false);
    }
  }

  function updateSection<K extends keyof BusinessProfile>(section: K, patch: Partial<BusinessProfile[K]>) {
    setProfile(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as Record<string, unknown>),
        ...patch,
      },
    }));
  }

  function handleAddManualProduct() {
    if (!newProd.name.trim()) {
      setError('Informe o nome do produto para cadastrar.');
      return;
    }
    setError('');
    const numPrice = Number(newProd.price.replace(',', '.')) || 0;
    const priceCents = Math.max(0, Math.round(numPrice * 100));
    const sku = (newProd.sku.trim() || `SKU-${profile.catalog.products.length + 1}`)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '-');
    const item: CatalogProduct = {
      id: `${sku.toLowerCase()}-${Date.now().toString(36)}`,
      sku,
      name: newProd.name.trim(),
      category: newProd.category.trim() || 'Geral',
      description: newProd.description.trim() || `${newProd.name.trim()} disponível com garantia e atendimento direto.`,
      priceCents,
      variation: newProd.variation.trim() || 'Padrão',
      stock: Math.max(0, Number.parseInt(newProd.stock, 10) || 10),
      active: true,
      imageUrl: '',
      approvedAsset: false,
      updatedAt: new Date().toISOString(),
    };
    setProfile(prev => ({
      ...prev,
      catalog: { products: [...prev.catalog.products, item] },
    }));
    setNewProd({ name: '', sku: '', price: '', stock: '10', category: 'Geral', variation: 'Padrão', description: '' });
  }

  async function handleUploadSpreadsheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const parsed = await parseSpreadsheetProducts(file);
      if (parsed.length === 0) {
        setError('Nenhum produto válido encontrado na planilha.');
        return;
      }
      setProfile(prev => {
        const existingSkus = new Set(prev.catalog.products.map(p => p.sku));
        const merged = [...prev.catalog.products];
        for (const p of parsed) {
          if (!existingSkus.has(p.sku)) {
            existingSkus.add(p.sku);
            merged.push(p);
          }
        }
        return { ...prev, catalog: { products: merged } };
      });
      setNotice(`${parsed.length} produto(s) importado(s) da planilha "${file.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler planilha.');
    }
  }

  async function handleHuntProductPhoto(product: CatalogProduct) {
    setHuntingId(product.id);
    setError('');
    try {
      const query = `${product.name} ${product.variation !== 'Padrão' ? product.variation : ''} produto foto`.trim();
      const results = await searchWebAssets(query, 4);
      const urls = results
        .map(r => ({ url: r.rawUrl, title: r.titleSnippet || product.name }))
        .filter(r => Boolean(r.url));
      setHuntCandidates(prev => ({ ...prev, [product.id]: urls }));
      if (urls[0]) {
        await applyImportedImage(product.id, urls[0].url, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível buscar imagens agora.');
    } finally {
      setHuntingId(null);
    }
  }

  async function applyImportedImage(productId: string, candidateUrl: string, approved: boolean) {
    let finalUrl = candidateUrl;
    try {
      const res = await authenticatedFetch('/api/whatsapp/api/importar-imagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: candidateUrl }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.imagemUrl) finalUrl = `/api/whatsapp${json.imagemUrl.startsWith('/') ? '' : '/'}${json.imagemUrl}`;
      }
    } catch {
      // Fallback to HTTPS url if import endpoint unavailable
    }

    setProfile(prev => ({
      ...prev,
      catalog: {
        products: prev.catalog.products.map(p =>
          p.id === productId
            ? { ...p, imageUrl: finalUrl, approvedAsset: approved }
            : p,
        ),
      },
    }));
  }

  function approveProductPhoto(productId: string) {
    setProfile(prev => ({
      ...prev,
      catalog: {
        products: prev.catalog.products.map(p =>
          p.id === productId
            ? { ...p, approvedAsset: Boolean(p.imageUrl) }
            : p,
        ),
      },
    }));
  }

  function removeProduct(productId: string) {
    setProfile(prev => ({
      ...prev,
      catalog: {
        products: prev.catalog.products.filter(p => p.id !== productId),
      },
    }));
  }

  async function handleSubmit() {
    if (!profile.business.name.trim()) {
      setStep(1);
      setError('Informe o nome da sua empresa para gerar a loja e as mensagens.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSaveAndGenerate({
        ...profile,
        onboarding: {
          ...profile.onboarding,
          fichaCompleted: true,
          storeGenerated: true,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ficha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7FAFF] text-[#0B1D52] py-6 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto bg-white border border-[#E0EAF8] rounded-3xl shadow-[0_12px_36px_rgba(11,29,82,0.07)] overflow-hidden">
        {/* Header */}
        <div className="px-7 py-5 border-b border-[#E0EAF8] flex flex-wrap items-center justify-between gap-4 bg-white">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#0867E8]">
              <span>FICHA ÚNICA DA EMPRESA</span>
              <span className="bg-[#EAF2FF] px-2 py-0.5 rounded-full">Revisão atual: {revision}</span>
              {profile.whatsapp.phoneE164 && (
                <span className="bg-[#DFFBE6] text-[#008E2D] px-2 py-0.5 rounded-full">
                  WhatsApp: {profile.whatsapp.displayPhone || profile.whatsapp.phoneE164}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold mt-1 tracking-tight">
              Configure uma vez — tudo sincroniza sozinho
            </h1>
          </div>
          {onBackToDual && (
            <Button type="button" variant="outline" onClick={onBackToDual}>
              ◄ Voltar para Loja + WhatsApp
            </Button>
          )}
        </div>

        {/* 7-step Pills */}
        <div className="px-7 py-3 bg-[#F3F7FD] border-b border-[#DCE8F7] flex flex-wrap gap-2">
          {STEPS.map(s => {
            const Icon = s.icon;
            const active = step === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  active
                    ? 'bg-[#0867E8] text-white shadow-sm'
                    : 'bg-white text-[#0B1D52] border border-[#DCE8F7] hover:bg-[#EAF2FF]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-7 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}
          {notice && (
            <div className="p-3.5 rounded-xl bg-[#DFFBE6] border border-emerald-200 text-[#008E2D] text-sm font-medium">
              {notice}
            </div>
          )}

          {step === 1 && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label>Nome da loja *</Label>
                <Input
                  value={profile.business.name}
                  placeholder="Ex: Loja do Alexandre"
                  onChange={e => updateSection('business', { name: e.target.value })}
                  className="mt-1.5"
                />
                <p className="text-xs text-[#64748B] mt-1">
                  Atualiza o cabeçalho da loja, os 50 moldes de WhatsApp, o checkout e o Dashboard.
                </p>
              </div>
              <div>
                <Label>Segmento</Label>
                <select
                  value={profile.business.segment}
                  onChange={e => updateSection('business', { segment: e.target.value })}
                  className="mt-1.5 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                >
                  <option value="Eletrônicos">Eletrônicos</option>
                  <option value="Moda">Moda e Acessórios</option>
                  <option value="Beleza">Beleza e Estética</option>
                  <option value="Alimentação">Alimentação</option>
                  <option value="Pet">Pet Shop</option>
                  <option value="Geral">Geral / Varejo</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição curta do negócio</Label>
                <Textarea
                  rows={3}
                  value={profile.business.description}
                  placeholder="Ex: Acessórios originais e assistência técnica na hora com envio rápido."
                  onChange={e => updateSection('business', { description: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2 p-4 rounded-2xl bg-[#F3F7FD] border border-[#DCE8F7] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>Instagram oficial da loja (@usuario)</Label>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Puxamos automaticamente a foto de perfil (logo) e dados públicos para a loja e cabeçalho.
                    </p>
                  </div>
                  {profile.brand.logoUrl && (
                    <img
                      src={profile.brand.logoUrl}
                      alt="Logo da marca"
                      className="h-12 w-12 rounded-xl object-contain bg-white border border-[#DCE8F7] p-1"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={profile.brand.instagram}
                    placeholder="@minhaloja"
                    onChange={e => updateSection('brand', { instagram: e.target.value })}
                    className="bg-white flex-1 min-w-[200px]"
                    data-testid="ficha-instagram-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={analyzingInstagram}
                    onClick={() => void handleAnalyzeInstagram()}
                    data-testid="ficha-instagram-analyze"
                    className="bg-white font-bold gap-1.5"
                  >
                    {analyzingInstagram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[#0867E8]" />}
                    {analyzingInstagram ? 'Analisando Instagram...' : 'Puxar foto e bio do Instagram'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label>Endereço completo da loja</Label>
                <Input
                  value={profile.business.address}
                  placeholder="Rua das Flores, 120 - Centro, Brasília/DF"
                  onChange={e => updateSection('business', { address: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Horário de funcionamento</Label>
                <Input
                  value={profile.business.hours}
                  placeholder="Seg a Sáb · 09h às 19h"
                  onChange={e => updateSection('business', { hours: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Link do Google Maps (opcional)</Label>
                <Input
                  value={profile.business.mapsUrl}
                  placeholder="https://maps.google.com/..."
                  onChange={e => updateSection('business', { mapsUrl: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={profile.whatsapp.displayPhone || profile.whatsapp.phoneE164 || 'Você conectará depois de gerar a loja'}
                  disabled
                  className="mt-1.5 bg-[#F3F7FD]"
                />
                <p className="text-xs text-[#64748B] mt-1">Primeiro conclua a ficha e confira sua vitrine. A conexão será o próximo passo.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label className="flex items-center gap-1.5">
                  Chave Pix <Lock className="w-3.5 h-3.5 text-[#0867E8]" />
                </Label>
                <Input
                  value={profile.payment.pixKey}
                  placeholder="CPF, CNPJ, e-mail ou telefone Pix"
                  onChange={e => updateSection('payment', { pixKey: e.target.value })}
                  className="mt-1.5"
                />
                <p className="text-xs text-[#64748B] mt-1">
                  Nunca vaza na vitrine pública. A Sofia só envia no WhatsApp quando o cliente escolhe Pix.
                </p>
              </div>
              <div>
                <Label>Desconto à vista no Pix (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={profile.payment.pixDiscountPercent}
                  onChange={e => updateSection('payment', { pixDiscountPercent: Number(e.target.value) || 0 })}
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Formas de pagamento aceitas no Fluxo A</Label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {([
                    ['pix', '1️⃣ Pix'],
                    ['credit_card', '2️⃣ Cartão de crédito'],
                    ['debit_card', '3️⃣ Cartão de débito'],
                    ['cash', '4️⃣ Dinheiro'],
                  ] as const).map(([key, label]) => {
                    const checked = profile.payment.acceptedMethods.includes(key);
                    return (
                      <label key={key} className="inline-flex items-center gap-2 border border-[#DCE8F7] rounded-xl px-3.5 py-2 text-sm cursor-pointer bg-[#F7FAFF]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? profile.payment.acceptedMethods.filter(m => m !== key)
                              : [...profile.payment.acceptedMethods, key];
                            updateSection('payment', { acceptedMethods: next.length ? next : ['pix'] });
                          }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid sm:grid-cols-2 gap-5">
              <label className="flex items-center gap-3 border border-[#DCE8F7] rounded-2xl p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.delivery.deliveryEnabled}
                  onChange={e => updateSection('delivery', { deliveryEnabled: e.target.checked })}
                />
                <div>
                  <div className="font-bold text-sm">Entrega em domicílio</div>
                  <div className="text-xs text-[#64748B]">Ativa solicitação de endereço completo no Fluxo A</div>
                </div>
              </label>
              <label className="flex items-center gap-3 border border-[#DCE8F7] rounded-2xl p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.delivery.pickupEnabled}
                  onChange={e => updateSection('delivery', { pickupEnabled: e.target.checked })}
                />
                <div>
                  <div className="font-bold text-sm">Retirada na loja física</div>
                  <div className="text-xs text-[#64748B]">Habilita opção de retirada com o endereço da ficha</div>
                </div>
              </label>
              <div>
                <Label>Regiões / Bairros atendidos (separados por vírgula)</Label>
                <Input
                  value={profile.delivery.areas.join(', ')}
                  placeholder="Centro, Asa Sul, Asa Norte, Águas Claras"
                  onChange={e =>
                    updateSection('delivery', {
                      areas: e.target.value.split(',').map(v => v.trim()).filter(Boolean),
                    })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Frete padrão (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.50"
                  value={(profile.delivery.defaultFeeCents / 100).toFixed(2)}
                  onChange={e => updateSection('delivery', { defaultFeeCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label>Nome da atendente IA</Label>
                <Input
                  value={profile.agent.name}
                  placeholder="Sofia"
                  onChange={e => updateSection('agent', { name: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Tom de voz</Label>
                <select
                  value={profile.agent.tone}
                  onChange={e => updateSection('agent', { tone: e.target.value as BusinessProfile['agent']['tone'] })}
                  className="mt-1.5 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                >
                  <option value="proximo">Próximo e acolhedor</option>
                  <option value="direto">Direto e objetivo</option>
                  <option value="formal">Formal e corporativo</option>
                  <option value="consultivo">Consultivo (compara opções)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>Mensagem de acolhimento customizada (opcional)</Label>
                <Textarea
                  rows={2}
                  value={profile.agent.welcomeMessage}
                  placeholder="Deixe vazio para usar o molde padrão WA-001 sincronizado com o nome da sua loja."
                  onChange={e => updateSection('agent', { welcomeMessage: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label>Instagram oficial (@usuario)</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={profile.brand.instagram}
                    placeholder="@minhaloja"
                    onChange={e => updateSection('brand', { instagram: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={analyzingInstagram}
                    onClick={() => void handleAnalyzeInstagram()}
                  >
                    {analyzingInstagram ? 'Buscando...' : 'Analisar IG'}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Logo da marca</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  {profile.brand.logoUrl && (
                    <img
                      src={profile.brand.logoUrl}
                      alt="Logo"
                      className="h-10 w-10 rounded-lg object-contain bg-white border p-0.5 shrink-0"
                    />
                  )}
                  <Input
                    value={profile.brand.logoUrl}
                    placeholder="https://... ou importe do Instagram"
                    onChange={e => updateSection('brand', { logoUrl: e.target.value })}
                  />
                  {profile.whatsapp.profilePhotoUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => updateSection('brand', { logoUrl: profile.whatsapp.profilePhotoUrl })}
                    >
                      Usar foto WPP
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label>Cor principal</Label>
                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="color"
                    value={profile.brand.primaryColor}
                    onChange={e => updateSection('brand', { primaryColor: e.target.value })}
                    className="h-10 w-16 rounded border cursor-pointer"
                  />
                  <span className="text-xs font-mono text-[#64748B]">{profile.brand.primaryColor}</span>
                </div>
              </div>
              <div>
                <Label>Cor de destaque</Label>
                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="color"
                    value={profile.brand.accentColor}
                    onChange={e => updateSection('brand', { accentColor: e.target.value })}
                    className="h-10 w-16 rounded border cursor-pointer"
                  />
                  <span className="text-xs font-mono text-[#64748B]">{profile.brand.accentColor}</span>
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#F3F7FD] border border-[#DCE8F7]">
                <div>
                  <h3 className="font-extrabold text-sm">Importar planilha (.xlsx ou .csv) ou adicionar manualmente</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Colunas aceitas: Nome/Produto, SKU, Preço, Estoque, Categoria, Variação, Descrição.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 bg-[#0867E8] hover:bg-[#0652BC] text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  Enviar planilha .xlsx / .csv
                  <input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={handleUploadSpreadsheet} />
                </label>
              </div>

              {/* Manual quick add */}
              <div className="grid sm:grid-cols-6 gap-3 p-4 border border-[#E0EAF8] rounded-2xl">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Nome do produto *</Label>
                  <Input
                    value={newProd.name}
                    placeholder="Película 3D blindada"
                    onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Preço (R$)</Label>
                  <Input
                    value={newProd.price}
                    placeholder="35,00"
                    onChange={e => setNewProd(p => ({ ...p, price: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Variação/Modelo</Label>
                  <Input
                    value={newProd.variation}
                    placeholder="iPhone 13"
                    onChange={e => setNewProd(p => ({ ...p, variation: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Estoque</Label>
                  <Input
                    type="number"
                    value={newProd.stock}
                    onChange={e => setNewProd(p => ({ ...p, stock: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" onClick={handleAddManualProduct} className="w-full h-9 gap-1.5 bg-[#0B1D52] text-white">
                    <Plus className="w-4 h-4" /> Adicionar
                  </Button>
                </div>
              </div>

              {/* Product List */}
              <div className="space-y-3">
                {profile.catalog.products.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-[#DCE8F7] rounded-2xl text-sm text-[#64748B]">
                    Nenhum produto cadastrado ainda. Envie uma planilha `.xlsx` ou adicione seu primeiro item acima.
                  </div>
                ) : (
                  profile.catalog.products.map(prod => (
                    <div key={prod.id} className="p-4 border border-[#E0EAF8] rounded-2xl flex flex-col gap-3 bg-white">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-[#F3F7FD] border border-[#DCE8F7] overflow-hidden flex items-center justify-center shrink-0">
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-contain p-1" />
                          ) : (
                            <ImagePlus className="w-6 h-6 text-[#64748B]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <strong className="text-sm font-extrabold">{prod.name}</strong>
                            <span className="text-[11px] font-mono bg-[#F3F7FD] px-2 py-0.5 rounded text-[#64748B]">
                              {prod.sku}
                            </span>
                            {prod.approvedAsset ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#DFFBE6] text-[#008E2D] px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Foto aprovada
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                                Foto pendente
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#64748B] mt-1">
                            {formatCurrencyBRL(prod.priceCents)} · Variação: {prod.variation} · Estoque: {prod.stock} un.
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleHuntProductPhoto(prod)}
                            disabled={huntingId === prod.id}
                            className="gap-1.5 text-xs"
                          >
                            {huntingId === prod.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                            Buscar foto
                          </Button>
                          {prod.imageUrl && !prod.approvedAsset && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => approveProductPhoto(prod.id)}
                              className="gap-1 bg-[#008E2D] hover:bg-[#007424] text-white text-xs"
                            >
                              <Check className="w-3.5 h-3.5" /> Aprovar foto
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeProduct(prod.id)} aria-label={`Remover ${prod.name}`}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>

                      {huntCandidates[prod.id]?.length ? (
                        <div className="flex gap-2 overflow-x-auto pt-1">
                          {huntCandidates[prod.id].map((cand, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => void applyImportedImage(prod.id, cand.url, true)}
                              className="w-16 h-16 rounded-lg border border-[#DCE8F7] hover:border-[#0867E8] overflow-hidden shrink-0 bg-white p-1"
                              title={cand.title || 'Selecionar e aprovar'}
                            >
                              <img src={cand.url} alt="" className="w-full h-full object-contain" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-7 py-4 bg-[#F7FAFF] border-t border-[#E0EAF8] flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            {step < 7 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(s => Math.min(7, s + 1))}
              >
                Próximo passo ➔
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="bg-[#0867E8] hover:bg-[#0652BC] text-white font-bold gap-2 px-6"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Salvar ficha e gerar minha loja ➔
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
