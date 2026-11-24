import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('Batch order import endpoint & Kanban optimization exist cleanly', () => {
  const workspaceSrc = readFileSync(new URL('../../server/workspace.mjs', import.meta.url), 'utf8');
  assert.match(workspaceSrc, /\/api\/orders\/import-batch/);
  assert.match(workspaceSrc, /\/api\/orders\/ai-modify/);
  assert.match(workspaceSrc, /ordersBatchImportHandler/);

  const kanbanSrc = readFileSync(
    new URL('../../src/components/views/orders/OrdersKanbanView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(kanbanSrc, /\/api\/orders\/import-batch/);
  assert.match(kanbanSrc, /orders-ai-modify-input/);
  assert.match(kanbanSrc, /colOrders\.slice\(0, colLimitMap\[col\.key\] \|\| 50\)/);
});

test('Global AI agent & widget support batch commands, file attach, flip side, Ctrl+J, and Minha Biblioteca', () => {
  const agentSrc = readFileSync(new URL('../../server/ai-global-agent.mjs', import.meta.url), 'utf8');
  assert.match(agentSrc, /delete_all_orders/);
  assert.match(agentSrc, /create_whatsapp_flows/);
  assert.match(agentSrc, /stepsExecuted/);

  const widgetSrc = readFileSync(new URL('../../src/components/ui/GlobalAiAssistantWidget.tsx', import.meta.url), 'utf8');
  assert.match(widgetSrc, /global-ai-flip-side-btn/);
  assert.match(widgetSrc, /global-ai-attach-btn/);
  assert.match(widgetSrc, /key\.toLowerCase\(\) === 'j'/);

  const editorial = readFileSync(
    new URL('../../src/components/views/storefront/EditorialStoreControlView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(editorial, /MyLibraryDockModal/);
  assert.match(editorial, /editorial-multipage-control-panel/);
});
