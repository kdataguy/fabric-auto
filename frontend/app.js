const starterPlan = {
  capacity: 'fadev01',
  mode: 'notebook',
  workspaces: [
    { name: 'ws-contoso-fin-engineering-dev', items: [
      ['vl_cnfgs_fin_env', 'VariableLibrary'],
      ['nb_ingst_fin_example_source', 'Notebook'],
      ['nb_trnsf_fin_raw_to_base', 'Notebook'],
      ['dp_orchs_fin_master', 'DataPipeline']
    ] },
    { name: 'ws-contoso-fin-store-dev', items: [
      ['lh_store_fin_landing', 'Lakehouse'],
      ['lh_store_fin_raw', 'Lakehouse'],
      ['lh_store_fin_base', 'Lakehouse'],
      ['lh_store_fin_enriched', 'Lakehouse'],
      ['lh_store_fin_curated', 'Lakehouse'],
      ['lh_store_fin_semantic', 'Lakehouse']
    ] },
    { name: 'ws-contoso-fin-analytics-dev', items: [
      ['sm_anlyz_fin_financial', 'SemanticModel'],
      ['rp_anlyz_fin_overview', 'Report']
    ] },
    { name: 'ws-contoso-fin-engineering-prd', items: [
      ['vl_cnfgs_fin_env', 'VariableLibrary'],
      ['nb_ingst_fin_example_source', 'Notebook'],
      ['nb_trnsf_fin_raw_to_base', 'Notebook'],
      ['dp_orchs_fin_master', 'DataPipeline']
    ] },
    { name: 'ws-contoso-fin-store-prd', items: [
      ['LH_STORE_fin_landing', 'Lakehouse'],
      ['LH_STORE_fin_raw', 'Lakehouse'],
      ['LH_STORE_fin_base', 'Lakehouse'],
      ['LH_STORE_fin_enriched', 'Lakehouse'],
      ['LH_STORE_fin_curated', 'Lakehouse'],
      ['LH_STORE_fin_semantic', 'Lakehouse']
    ] },
    { name: 'ws-contoso-fin-analytics-prd', items: [
      ['sm_anlyz_fin_financial', 'SemanticModel'],
      ['rp_anlyz_fin_overview', 'Report']
    ] }
  ]
};

let plan = JSON.parse(localStorage.getItem('fabricflow-plan') || localStorage.getItem('fabric-auto-plan') || 'null') || structuredClone(starterPlan);
const grid = document.querySelector('#workspaceGrid');
const output = document.querySelector('#planOutput');
const count = document.querySelector('#planCount');
const capacityDisplay = document.querySelector('#capacityDisplay');
const copyParameters = document.querySelector('#copyParameters');
const formMessage = document.querySelector('#formMessage');
const deployMessage = document.querySelector('#deployMessage');
const gitMessage = document.querySelector('#gitMessage');
const gitSelectionCount = document.querySelector('#gitSelectionCount');
const progressPanel = document.querySelector('#progressPanel');
const progressSummary = document.querySelector('#progressSummary');
const progressPercent = document.querySelector('#progressPercent');
const progressBar = document.querySelector('#progressBar');
const progressList = document.querySelector('#progressList');

function selectedValues(selector) {
  return [...document.querySelectorAll(selector)].filter((input) => input.checked).map((input) => input.value);
}

async function generatePlan() {
  const payload = {
    org: document.querySelector('#orgInput').value,
    capacity: document.querySelector('#capacitySelect').value || document.querySelector('#capacityInput').value,
    domains: document.querySelector('#domainsInput').value.split(',').map((value) => value.trim()).filter(Boolean),
    environments: selectedValues('fieldset:first-of-type input[type="checkbox"]'),
    components: selectedValues('fieldset:last-of-type input[type="checkbox"]'),
    mode: plan.mode
  };
  formMessage.textContent = 'Generating plan...';
  try {
    const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    plan = data;
    render();
    const validation = await validatePlan(false);
    formMessage.textContent = validation.valid
      ? 'Plan updated and validated. Review names below before provisioning.'
      : `Plan needs attention: ${validation.errors[0]}`;
  } catch (error) {
    formMessage.textContent = `Plan error: ${error.message}`;
  }
}

async function validatePlan(showMessage = true) {
  const response = await fetch('/api/plan/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Plan validation failed');
  if (showMessage) {
    const detail = result.warnings.length ? ` ${result.warnings[0]}` : '';
    formMessage.textContent = result.valid ? `Plan is valid.${detail}` : `Plan error: ${result.errors[0]}`;
  }
  return result;
}

async function loadSubscriptions() {
  const select = document.querySelector('#subscriptionSelect');
  try {
    const response = await fetch('/api/azure/subscriptions');
    const subscriptions = await response.json();
    if (!response.ok) throw new Error(subscriptions.error);
    select.innerHTML = subscriptions.map((subscription) => `<option value="${subscription.id}">${subscription.name}</option>`).join('');
    if (subscriptions[0]) {
      try {
        await loadCapacities(subscriptions[0].id);
      } catch (error) {
        formMessage.textContent = `Capacity discovery unavailable: ${error.message}. Select another subscription.`;
      }
    }
  } catch (error) {
    select.innerHTML = '<option value="">Azure login required</option>';
    formMessage.textContent = `Azure discovery unavailable: ${error.message}`;
  }
}

async function loadCapacities(subscriptionId) {
  const select = document.querySelector('#capacitySelect');
  select.innerHTML = '<option value="">Loading capacities...</option>';
  const response = await fetch('/api/azure/capacities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionId }) });
  const capacities = await response.json();
  if (!response.ok) throw new Error(capacities.error);
  select.innerHTML = capacities.filter((capacity) => capacity.state === 'Succeeded').map((capacity) => `<option value="${capacity.name}">${capacity.name} · ${capacity.region} · ${capacity.sku?.name || 'Fabric'}</option>`).join('') || '<option value="">No succeeded capacities found</option>';
  if (select.value) document.querySelector('#capacityInput').value = select.value;
}

function environment(name) {
  return name.endsWith('-prd') ? 'prd' : name.endsWith('-tst') ? 'tst' : name.endsWith('-dev') ? 'dev' : 'custom';
}

function itemName(item) {
  return Array.isArray(item) ? item[0] : item.name;
}

function itemType(item) {
  return Array.isArray(item) ? item[1] : item.type;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function workspaceEnvironment(name) {
  return ['dev', 'tst', 'prd'].find((value) => name.endsWith(`-${value}`)) || 'custom';
}

function workspaceDomain(name) {
  const parts = name.split('-');
  return parts.length > 4 ? parts.slice(2, -2).join('-') : 'fin';
}

function isGitSelected(workspace) {
  return workspace.gitSelected === true;
}

function syncBronzeItems(mode) {
  plan.workspaces.forEach((workspace) => {
    if (!workspace.name.includes('-store-')) return;
    workspace.items = workspace.items.filter((item) => !['notebook', 'copy_activity'].includes(item.ingestion_method));
    const domain = workspaceDomain(workspace.name);
    if (mode === 'notebook') {
      workspace.items.push({
        name: `nb_ingst_${domain}_example_source`,
        type: 'Notebook',
        ingestion_method: 'notebook',
        ...(domain === 'fin' ? { definition: 'notebooks/NB_INGST_fin_example_source.ipynb' } : {})
      });
    } else {
      workspace.items.push({
        name: `dp_ingst_${domain}_landing_loader`,
        type: 'DataPipeline',
        ingestion_method: 'copy_activity',
        ...(domain === 'fin' ? { definition: 'pipelines/DP_INGST_fin_landing_loader.json' } : {})
      });
    }
  });
}

function renderWorkspaces() {
  gitSelectionCount.textContent = `${plan.workspaces.filter(isGitSelected).length} of ${plan.workspaces.length} workspaces selected`;
  if (!plan.workspaces.length) {
    grid.innerHTML = '<div class="empty-state"><strong>No workspaces in this plan</strong><span>Generate a scope above or add a workspace manually.</span></div>';
    return;
  }
  grid.innerHTML = plan.workspaces.map((workspace, workspaceIndex) => `
    <article class="workspace-card${isGitSelected(workspace) ? ' git-selected' : ''}">
      <header>
        <div class="workspace-title"><label class="workspace-select"><input type="checkbox" data-git-workspace="${workspaceIndex}" ${isGitSelected(workspace) ? 'checked' : ''}><span>Include in Git</span></label><span class="workspace-kicker">WORKSPACE ${String(workspaceIndex + 1).padStart(2, '0')}</span><input aria-label="Workspace name" data-workspace="${workspaceIndex}" value="${escapeHtml(workspace.name)}"></div>
        <span class="env-tag">${workspaceEnvironment(workspace.name)}</span>
      </header>
      <div class="workspace-summary"><span>${workspace.items.length} items</span><span>${workspace.name.includes('-store-') ? (plan.mode === 'copy_activity' ? 'Copy activity' : 'Notebook') : 'Platform layer'}</span></div>
      <div class="item-list">
        ${workspace.items.map((item, itemIndex) => `
          <div class="item-row">
            <span>${escapeHtml(itemName(item))}</span>
            <span class="item-type">${escapeHtml(itemType(item))}</span>
            <button class="remove-button" title="Remove item" aria-label="Remove ${escapeHtml(itemName(item))}" data-remove="${workspaceIndex}:${itemIndex}">×</button>
          </div>
        `).join('')}
      </div>
      <div class="workspace-actions">
        <button class="add-item" data-add-item="${workspaceIndex}">+ add item</button>
        <button class="remove-workspace" data-remove-workspace="${workspaceIndex}">Remove from plan</button>
        <button class="delete-workspace" data-delete-workspace="${workspaceIndex}">Delete in Fabric</button>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('[data-workspace]').forEach((input) => {
    input.addEventListener('change', (event) => {
      plan.workspaces[Number(event.target.dataset.workspace)].name = event.target.value.trim() || 'new-workspace';
      render();
    });
  });
  grid.querySelectorAll('[data-git-workspace]').forEach((input) => {
    input.addEventListener('change', (event) => {
      plan.workspaces[Number(event.target.dataset.gitWorkspace)].gitSelected = event.target.checked;
      render();
    });
  });
  grid.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const [workspaceIndex, itemIndex] = button.dataset.remove.split(':').map(Number);
      plan.workspaces[workspaceIndex].items.splice(itemIndex, 1);
      render();
    });
  });
  grid.querySelectorAll('[data-add-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = prompt('Item name');
      if (!name) return;
      const type = prompt('Fabric type (Notebook, Lakehouse, Warehouse, DataPipeline, DataflowGen2, Eventstream, Report, SemanticModel, VariableLibrary)', 'Notebook');
      if (!type) return;
      plan.workspaces[Number(button.dataset.addItem)].items.push({ name: name.trim(), type: type.trim() });
      render();
    });
  });
  grid.querySelectorAll('[data-delete-workspace]').forEach((button) => {
    button.addEventListener('click', () => deleteWorkspace(Number(button.dataset.deleteWorkspace)));
  });
  grid.querySelectorAll('[data-remove-workspace]').forEach((button) => {
    button.addEventListener('click', () => {
      const workspaceIndex = Number(button.dataset.removeWorkspace);
      const workspace = plan.workspaces[workspaceIndex];
      plan.workspaces.splice(workspaceIndex, 1);
      deployMessage.textContent = `${workspace.name} removed from the local plan. Fabric was not changed.`;
      render();
    });
  });
}

async function deleteWorkspace(workspaceIndex) {
  const workspace = plan.workspaces[workspaceIndex];
  const confirmation = window.prompt(`This permanently deletes ${workspace.name} and every item inside it. Type the workspace name to continue:`);
  if (confirmation !== workspace.name) return;
  const button = grid.querySelector(`[data-delete-workspace="${workspaceIndex}"]`);
  button.disabled = true;
  deployMessage.textContent = `Deleting ${workspace.name}...`;
  try {
    const response = await fetch('/api/workspace/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceName: workspace.name, confirmName: confirmation, confirm: true }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    plan.workspaces.splice(workspaceIndex, 1);
    deployMessage.textContent = `Deleted ${workspace.name} and its items from Fabric.`;
    render();
  } catch (error) {
    deployMessage.textContent = `Delete failed: ${error.message}`;
    button.disabled = false;
  }
}

function renderPlan() {
  const selectedItems = plan.workspaces.flatMap((workspace) => workspace.items.map((item) => ({ workspace: workspace.name, name: itemName(item), type: itemType(item) })));
  count.textContent = `${plan.workspaces.length} workspaces · ${selectedItems.length} items`;
  capacityDisplay.textContent = plan.capacity;
  output.textContent = selectedItems.length ? selectedItems.map((item) => `fab create ${item.workspace}.Workspace/${item.name}.${item.type}`).join('\n') : 'Generate a scope to see the provisioning commands.';
  copyParameters.hidden = plan.mode !== 'copy_activity';
  document.querySelectorAll('.choice-card').forEach((card) => card.classList.toggle('selected', card.dataset.mode === plan.mode));
}

function render() {
  localStorage.setItem('fabricflow-plan', JSON.stringify(plan));
  renderWorkspaces();
  renderPlan();
}

document.querySelectorAll('.choice-card').forEach((card) => card.addEventListener('click', () => {
  plan.mode = card.dataset.mode;
  syncBronzeItems(plan.mode);
  render();
}));

document.querySelector('#generateButton').addEventListener('click', generatePlan);
document.querySelector('#subscriptionSelect').addEventListener('change', (event) => loadCapacities(event.target.value).catch((error) => { formMessage.textContent = `Capacity discovery unavailable: ${error.message}`; }));
document.querySelector('#capacitySelect').addEventListener('change', (event) => { document.querySelector('#capacityInput').value = event.target.value; });

document.querySelector('#deployButton').addEventListener('click', async (event) => {
  try {
    const validation = await validatePlan(false);
    if (!validation.valid) {
      deployMessage.textContent = `Deployment blocked: ${validation.errors[0]}`;
      return;
    }
  } catch (error) {
    deployMessage.textContent = `Validation failed: ${error.message}`;
    return;
  }
  if (!window.confirm('Deploy this reviewed plan to Fabric? This will create the listed workspaces and items.')) return;
  const deployButton = event.currentTarget;
  deployMessage.textContent = 'Deployment started.';
  progressPanel.hidden = false;
  progressList.innerHTML = '';
  deployButton.disabled = true;
  try {
    const response = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, confirm: true }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    let status = result;
    while (status.status === 'queued' || status.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const statusResponse = await fetch(`/api/provision/status?job=${result.jobId}`);
      status = await statusResponse.json();
      const completed = status.completed || 0;
      const total = status.total || 0;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      progressSummary.textContent = `${completed} of ${total} commands completed`;
      progressPercent.textContent = `${percent}%`;
      progressBar.style.width = `${percent}%`;
      progressList.innerHTML = (status.events || []).map((entry) => `<li class="progress-${entry.status}"><span>${entry.status === 'completed' ? '✓' : '…'}</span>${entry.command}</li>`).join('');
    }
    if (status.status !== 'completed') throw new Error(status.error || 'Deployment failed');
    deployMessage.textContent = `Deployment complete: ${status.workspaces} workspaces, ${status.items} items.`;
    progressSummary.textContent = 'Deployment complete';
    progressPercent.textContent = '100%';
    progressBar.style.width = '100%';
  } catch (error) {
    deployMessage.textContent = `Deployment failed: ${error.message}`;
  } finally {
    deployButton.disabled = false;
  }
});

document.querySelector('#connectGitButton').addEventListener('click', async () => {
  const selectedWorkspaces = plan.workspaces.filter(isGitSelected);
  if (!selectedWorkspaces.length) {
    gitMessage.textContent = 'Select at least one workspace first.';
    return;
  }
  if (!window.confirm(`Connect ${selectedWorkspaces.length} selected workspace(s) to Azure DevOps Git?`)) return;
  gitMessage.textContent = 'Connecting...';
  const response = await fetch('/api/git/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organization: document.querySelector('#gitOrganization').value, project: document.querySelector('#gitProject').value, repository: document.querySelector('#gitRepository').value, branch: document.querySelector('#gitBranch').value, workspaces: selectedWorkspaces, confirm: true }) });
  const result = await response.json();
  gitMessage.textContent = response.ok ? `Git connected to ${result.workspaces.length} workspaces.` : `Git connection failed: ${result.error}`;
});

document.querySelector('#addWorkspaceButton').addEventListener('click', () => {
  plan.workspaces.push({ name: 'new-workspace', items: [] });
  render();
  grid.lastElementChild?.querySelector('input')?.focus();
});

document.querySelector('#saveButton').addEventListener('click', (event) => {
  localStorage.setItem('fabricflow-plan', JSON.stringify(plan));
  event.currentTarget.textContent = 'Saved';
  setTimeout(() => { event.currentTarget.textContent = 'Save locally'; }, 1200);
});

document.querySelector('#downloadButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fabricflow-plan.json';
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector('#copyCommandButton').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText('python scripts\\validate.py\n.\\scripts\\provision.ps1 -Preview');
  event.currentTarget.innerHTML = 'Copied <span>✓</span>';
  setTimeout(() => { event.currentTarget.innerHTML = 'Copy commands <span>→</span>'; }, 1200);
});

function addPlanTools() {
  const actions = document.querySelector('.review-actions');
  if (!actions || document.querySelector('#importPlanButton')) return;
  const importButton = document.createElement('button');
  importButton.className = 'secondary-button';
  importButton.id = 'importPlanButton';
  importButton.textContent = 'Import plan';
  const validateButton = document.createElement('button');
  validateButton.className = 'secondary-button';
  validateButton.id = 'validatePlanButton';
  validateButton.textContent = 'Validate plan';
  const diffButton = document.createElement('button');
  diffButton.className = 'secondary-button';
  diffButton.id = 'dryRunButton';
  diffButton.textContent = 'Dry run';
  const historyButton = document.createElement('button');
  historyButton.className = 'secondary-button';
  historyButton.id = 'historyButton';
  historyButton.textContent = 'History';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.hidden = true;
  actions.prepend(historyButton, diffButton, validateButton, importButton, fileInput);

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const validationResponse = await fetch('/api/plan/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: imported }) });
      const validation = await validationResponse.json();
      if (!validation.valid) throw new Error(validation.errors[0]);
      plan = imported;
      render();
      formMessage.textContent = 'Plan imported and validated.';
    } catch (error) {
      formMessage.textContent = `Import failed: ${error.message}`;
    } finally {
      fileInput.value = '';
    }
  });
  validateButton.addEventListener('click', () => validatePlan(true).catch((error) => { formMessage.textContent = `Validation failed: ${error.message}`; }));
  diffButton.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/plan/diff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0] || result.error);
      output.textContent = result.operations.map((operation) => `${operation.action.toUpperCase()} ${operation.resource}\n  ${operation.command}`).join('\n');
      deployMessage.textContent = `${result.operations.length} operations previewed. ${result.summary}`;
    } catch (error) {
      deployMessage.textContent = `Dry run failed: ${error.message}`;
    }
  });
  historyButton.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/deployments');
      const history = await response.json();
      deployMessage.textContent = history.length
        ? history.map((entry) => `${entry.timestamp} · ${entry.workspaces.length} workspace(s) · ${entry.id}`).join('\n')
        : 'No completed deployments recorded yet.';
      if (history.length) {
        const deploymentId = window.prompt('Enter a deployment ID to roll back, or cancel:');
        if (!deploymentId) return;
        const deployment = history.find((entry) => entry.id === deploymentId.trim());
        if (!deployment) throw new Error('Deployment ID was not found');
        const confirmation = window.prompt(`This permanently deletes ${deployment.workspaces.join(', ')}. Type ROLLBACK to continue:`);
        if (confirmation !== 'ROLLBACK') return;
        const rollbackResponse = await fetch('/api/deployments/rollback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deploymentId: deployment.id, confirm: true }) });
        const result = await rollbackResponse.json();
        if (!rollbackResponse.ok) throw new Error(result.error);
        deployMessage.textContent = `Rollback complete: ${result.workspaces.length} workspace(s) deleted.`;
      }
    } catch (error) {
      deployMessage.textContent = `History unavailable: ${error.message}`;
    }
  });
}

document.querySelector('#resetButton').addEventListener('click', () => {
  plan = structuredClone(starterPlan);
  document.querySelector('#orgInput').value = 'contoso';
  document.querySelector('#capacityInput').value = 'fadev01';
  document.querySelector('#domainsInput').value = 'fin';
  render();
});

addPlanTools();
render();
loadSubscriptions();
