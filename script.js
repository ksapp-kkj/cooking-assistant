function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const btn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
    if (btn) btn.classList.add('active');
}

let units = JSON.parse(localStorage.getItem('cookingUnits')) || ['g', 'ml', '大さじ', '小さじ', '個', '本', 'パック'];
let foods = JSON.parse(localStorage.getItem('cookingFoods')) || [
    { name: '豚肉', category: '肉類', cookingUnit: 'g', shoppingUnit: 'パック' },
    { name: '玉ねぎ', category: '野菜・果物', cookingUnit: '個', shoppingUnit: '袋' },
    { name: 'にんじん', category: '野菜・果物', cookingUnit: '本', shoppingUnit: '袋' },
    { name: 'じゃがいも', category: '野菜・果物', cookingUnit: '個', shoppingUnit: '袋' },
    { name: 'カレールー', category: '調味料', cookingUnit: 'かけ', shoppingUnit: '箱' }
];

foods = foods.map(f => f.category ? f : { ...f, category: 'その他' });

let recipes = JSON.parse(localStorage.getItem('cookingRecipes'));
if (!recipes || recipes.length === 0) {
    recipes = [
        { id: Date.now(), name: '豚肉の生姜焼き', ingredients: [ { foodName: '豚肉', amount: '200' }, { foodName: '玉ねぎ', amount: '0.5' } ], steps: ['玉ねぎを薄切りにする。', 'フライパンで豚肉と玉ねぎを炒める。', '調味料を絡めて完成。'] },
        { id: Date.now() + 1, name: '定番カレーライス', ingredients: [ { foodName: '豚肉', amount: '200' }, { foodName: '玉ねぎ', amount: '2' }, { foodName: 'じゃがいも', amount: '2' }, { foodName: 'にんじん', amount: '1' }, { foodName: 'カレールー', amount: '4' } ], steps: ['具材を一口大に切る。', '鍋で具材を炒める。', '水を加えて煮込み、ルーを溶かす。'] }
    ];
    localStorage.setItem('cookingRecipes', JSON.stringify(recipes));
}

let selectedRecipeIds = JSON.parse(localStorage.getItem('cookingSelectedRecipes')) || [];
let inventoryStock = JSON.parse(localStorage.getItem('cookingInventoryStock')) || {};
let shoppingChecked = JSON.parse(localStorage.getItem('cookingShoppingChecked')) || {};

const CATEGORIES = ['肉類', '野菜・果物', '魚介類', '調味料', 'その他'];
let isUnitEditMode = false;
let editingFoodIndex = -1;
let editingRecipeId = null;

document.addEventListener('DOMContentLoaded', () => {
    renderUnits();
    renderInventory();
    renderRecipes();
    renderMenuRecipes();
    renderShoppingList();
    renderCooking();
    updateModalUnitOptions();
});

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.add('hidden');
    }
}

function openInfoModal(type) {
    const infos = {
        'menu': { title: '献立選択の使い方', text: 'レシピをクリックして今日の献立に追加します。（複数選択可）<br><br>※現在の在庫で作れる料理には「✨ 今ある在庫で作れます！」のバッジが表示されます。' },
        'inventory': { title: '食材管理の使い方', text: '現在登録されている全食材の在庫を一覧できます。<br>カテゴリ名をクリックすると開閉します。<br><br>在庫データは保存され、買い物や調理と連動して自動で増減します。在庫数の直接変更や、新しい食材の追加・削除もここから可能です。' },
        'shopping': { title: '買い物リストの使い方', text: 'スーパーでカゴに食材を入れたらチェックをつけ、実際に購入した量を入力してください。<br><br>一番下の「買い物完了」ボタンを押すと、チェックした食材が在庫に自動的に追加されます。' },
        'cooking': { title: '調理画面の使い方', text: '今日の献立の手順を確認しながら調理を進めます。<br><br>調理が終わったら一番下の「調理完了」ボタンを押すことで、使用した食材が在庫から自動的に消費（マイナス）されます。<br>※在庫が足りない場合は完了ボタンが押せません。' },
        'settings': { title: '管理画面の使い方', text: 'アプリの基本データ（単位・食材マスター・レシピマスター）を管理します。<br><br>新しく追加した単位や食材は、レシピ作成時の選択肢として使えるようになります。' }
    };
    document.getElementById('info-modal-title').textContent = infos[type].title;
    document.getElementById('info-modal-body').innerHTML = infos[type].text;
    document.getElementById('info-modal').classList.remove('hidden');
}

function openFoodModal(foodName = null) {
    updateModalUnitOptions();
    if (foodName) {
        editingFoodIndex = foods.findIndex(f => f.name === foodName);
        const food = foods[editingFoodIndex];
        document.getElementById('food-modal-title').textContent = '食材の編集';
        document.getElementById('modal-food-name').value = food.name;
        document.getElementById('modal-food-category').value = food.category;
        document.getElementById('modal-cooking-unit').value = food.cookingUnit;
        document.getElementById('modal-shopping-unit').value = food.shoppingUnit;
        document.getElementById('modal-food-submit-btn').textContent = '更新する';
    } else {
        editingFoodIndex = -1;
        document.getElementById('food-modal-title').textContent = '食材の登録';
        document.getElementById('modal-food-name').value = '';
        document.getElementById('modal-food-category').value = '肉類';
        document.getElementById('modal-cooking-unit').value = '';
        document.getElementById('modal-shopping-unit').value = '';
        document.getElementById('modal-food-submit-btn').textContent = '登録する';
    }
    document.getElementById('food-modal').classList.remove('hidden');
}

function saveFoodFromModal() {
    const name = document.getElementById('modal-food-name').value.trim();
    const category = document.getElementById('modal-food-category').value;
    const cookingUnit = document.getElementById('modal-cooking-unit').value;
    const shoppingUnit = document.getElementById('modal-shopping-unit').value;
    if (!name || !cookingUnit || !shoppingUnit) return alert('「食材名」「単位」はすべて入力してください。');
    if (editingFoodIndex >= 0) {
        const oldName = foods[editingFoodIndex].name;
        if (oldName !== name) {
            inventoryStock[name] = inventoryStock[oldName] || 0;
            delete inventoryStock[oldName];
            localStorage.setItem('cookingInventoryStock', JSON.stringify(inventoryStock));
        }
        foods[editingFoodIndex] = { name, category, cookingUnit, shoppingUnit };
    } else {
        if (foods.find(f => f.name === name)) return alert('すでに同じ名前の食材が登録されています。');
        foods.push({ name, category, cookingUnit, shoppingUnit });
    }
    localStorage.setItem('cookingFoods', JSON.stringify(foods));
    closeModal('food-modal');
    updateAllRecipeIngredientSelects();
    renderInventory();
    renderShoppingList();
    renderMenuRecipes(); 
}

function deleteFoodData(foodName) {
    if(confirm(`「${foodName}」を食材一覧から削除しますか？\n（※在庫データも消去されます）`)) {
        foods = foods.filter(f => f.name !== foodName);
        delete inventoryStock[foodName];
        delete shoppingChecked[foodName];
        localStorage.setItem('cookingFoods', JSON.stringify(foods));
        localStorage.setItem('cookingInventoryStock', JSON.stringify(inventoryStock));
        localStorage.setItem('cookingShoppingChecked', JSON.stringify(shoppingChecked));
        updateAllRecipeIngredientSelects();
        renderInventory();
        renderShoppingList();
        renderMenuRecipes();
    }
}

function updateStock(foodName, value) {
    inventoryStock[foodName] = parseFloat(value) || 0;
    localStorage.setItem('cookingInventoryStock', JSON.stringify(inventoryStock));
    renderInventory();
    renderShoppingList();
    renderMenuRecipes();
    renderCooking(); 
}

function renderInventory() {
    const container = document.getElementById('inventory-list');
    if (!container) return;

    if (foods.length === 0) {
        container.innerHTML = '<p class="empty-msg">食材が登録されていません。「＋ 食材を追加」から登録してください。</p>';
        return;
    }

    const required = calculateRequiredFoods();
    let html = '';

    CATEGORIES.forEach(cat => {
        const catFoods = foods.filter(f => f.category === cat);
        if (catFoods.length === 0) return;

        html += `<details class="category-details" open>
                    <summary class="category-summary">${cat} <span class="category-count">(${catFoods.length}件)</span></summary>
                    <div class="inventory-grid">
                        <div class="inv-header">食材名</div>
                        <div class="inv-header">在庫</div>
                        <div class="inv-header">状態（今日の必要量）</div>
                        <div class="inv-header text-center">操作</div>`;

        catFoods.forEach(food => {
            const foodName = food.name;
            const unit = food.cookingUnit;
            const stock = inventoryStock[foodName] || 0;
            const reqAmount = required[foodName] || 0;
            const lacking = Math.max(0, reqAmount - stock);

            let statusHtml = '<span class="status-none">必要なし</span>';
            if (reqAmount > 0) {
                if (lacking > 0) {
                    statusHtml = `<span class="status-text text-red">必要:${reqAmount}${unit}<br>(不足:${lacking}${unit})</span>`;
                } else {
                    statusHtml = `<span class="status-text text-green">必要:${reqAmount}${unit}<br>(足りています)</span>`;
                }
            }

            const rowClass = reqAmount > 0 ? 'highlight-row' : '';

            html += `
                <div class="inv-cell font-bold ${rowClass}">${foodName}</div>
                <div class="inv-cell ${rowClass}">
                    <input type="number" min="0" step="any" class="stock-input" value="${stock}" onchange="updateStock('${foodName}', this.value)"> ${unit}
                </div>
                <div class="inv-cell cell-status ${rowClass}">${statusHtml}</div>
                <div class="inv-cell cell-action ${rowClass}">
                    <button onclick="openFoodModal('${foodName}')" class="modify-btn small-btn">修正</button>
                    <button onclick="deleteFoodData('${foodName}')" class="delete-btn small-btn">削除</button>
                </div>
            `;
        });
        html += `</div></details>`;
    });
    container.innerHTML = html;
}

function toggleMenuSelection(id) {
    if (selectedRecipeIds.includes(id)) {
        selectedRecipeIds = selectedRecipeIds.filter(rId => rId !== id);
    } else {
        selectedRecipeIds.push(id);
    }
    localStorage.setItem('cookingSelectedRecipes', JSON.stringify(selectedRecipeIds));
    renderMenuRecipes();
    renderInventory();
    renderShoppingList();
    renderCooking();
}

function checkIfCookable(recipe) {
    if (!recipe.ingredients || recipe.ingredients.length === 0) return false;
    for (const ing of recipe.ingredients) {
        const reqAmount = parseFloat(ing.amount) || 0;
        const stock = inventoryStock[ing.foodName] || 0;
        if (stock < reqAmount) return false; 
    }
    return true;
}

function renderMenuRecipes() {
    const gridElement = document.getElementById('menu-recipe-list');
    if (!gridElement) return;
    gridElement.innerHTML = '';
    if (recipes.length === 0) {
        gridElement.innerHTML = '<p class="empty-msg">まだレシピがありません。</p>';
        return;
    }
    recipes.forEach(recipe => {
        const isSelected = selectedRecipeIds.includes(recipe.id);
        const isCookable = checkIfCookable(recipe);
        const card = document.createElement('div');
        card.className = `recipe-card ${isSelected ? 'selected' : ''}`;
        card.onclick = () => toggleMenuSelection(recipe.id);
        card.innerHTML = `
            ${isCookable ? '<div class="cookable-badge">✨ 今ある在庫で作れます！</div>' : ''}
            <h3>${recipe.name}</h3>
            <div class="recipe-card-meta">
                <p><strong>材料:</strong> ${recipe.ingredients.map(i => i.foodName).join('、')}</p>
                <p><strong>手順:</strong> ${recipe.steps.length}ステップ</p>
            </div>
            <div class="selection-indicator">${isSelected ? '✓ 献立に追加済み' : '＋ 献立に追加'}</div>
        `;
        gridElement.appendChild(card);
    });
}

function calculateRequiredFoods() {
    const required = {};
    selectedRecipeIds.forEach(id => {
        const recipe = recipes.find(r => r.id === id);
        if (recipe) {
            recipe.ingredients.forEach(ing => {
                if (!required[ing.foodName]) required[ing.foodName] = 0;
                required[ing.foodName] += parseFloat(ing.amount) || 0;
            });
        }
    });
    return required;
}

function toggleShoppingCheck(foodName, isChecked) {
    shoppingChecked[foodName] = isChecked;
    localStorage.setItem('cookingShoppingChecked', JSON.stringify(shoppingChecked));
    renderShoppingList();
}

function renderShoppingList() {
    const container = document.getElementById('shopping-list-container');
    const completeBtnContainer = document.getElementById('shopping-complete-container');
    if (!container || !completeBtnContainer) return;

    const required = calculateRequiredFoods();
    container.innerHTML = '';
    let hasMissing = false;

    for (const [foodName, reqAmount] of Object.entries(required)) {
        const stock = inventoryStock[foodName] || 0;
        const lacking = reqAmount - stock;
        if (lacking > 0) {
            hasMissing = true;
            const foodMaster = foods.find(f => f.name === foodName);
            const unit = foodMaster ? foodMaster.cookingUnit : '';
            const shopUnit = foodMaster ? foodMaster.shoppingUnit : '';
            const li = document.createElement('li');
            const isChecked = shoppingChecked[foodName] || false;
            li.innerHTML = `
                <div class="shopping-item-wrapper ${isChecked ? 'checked' : ''}">
                    <label class="shopping-item-top">
                        <input type="checkbox" onchange="toggleShoppingCheck('${foodName}', this.checked)" ${isChecked ? 'checked' : ''}>
                        <div class="shopping-details">
                            <span class="shopping-food-name">${foodName}</span>
                            <span class="unit-badge alert-badge">不足: ${lacking} ${unit}</span>
                            <span class="unit-badge">購入単位: ${shopUnit}</span>
                        </div>
                    </label>
                    <div class="shopping-item-bottom">
                        購入量: <input type="number" id="buy-amount-${foodName}" class="buy-amount-input" value="${lacking}" min="0" step="any"> ${unit}
                    </div>
                </div>
            `;
            container.appendChild(li);
        }
    }
    if (!hasMissing) {
        completeBtnContainer.classList.add('hidden');
        if (selectedRecipeIds.length === 0) {
            container.innerHTML = '<p class="empty-msg">献立が選択されていません。</p>';
        } else {
            container.innerHTML = '<p class="success-msg">🎉 必要な食材はすべて揃っています！買い物は不要です。</p>';
        }
    } else {
        completeBtnContainer.classList.remove('hidden');
    }
}

function completeShopping() {
    let itemsAdded = 0;
    for (const [foodName, isChecked] of Object.entries(shoppingChecked)) {
        if (isChecked) {
            const inputEl = document.getElementById(`buy-amount-${foodName}`);
            if (inputEl) {
                const boughtAmount = parseFloat(inputEl.value) || 0;
                inventoryStock[foodName] = (inventoryStock[foodName] || 0) + boughtAmount;
                itemsAdded++;
            }
        }
    }
    if (itemsAdded === 0) return alert('チェックを入れた食材がありません。');
    localStorage.setItem('cookingInventoryStock', JSON.stringify(inventoryStock));
    shoppingChecked = {};
    localStorage.setItem('cookingShoppingChecked', JSON.stringify(shoppingChecked));
    alert(`買い物完了！ ${itemsAdded}種類の食材を在庫に追加しました。`);
    renderInventory();
    renderShoppingList();
    renderMenuRecipes();
    renderCooking();
}

function renderCooking() {
    const container = document.getElementById('cooking-recipe-list');
    const completeBtnContainer = document.getElementById('cooking-complete-container');
    const btn = document.getElementById('cooking-complete-btn');
    const warning = document.getElementById('cooking-warning-msg');
    
    if (!container || !completeBtnContainer || !btn || !warning) return;
    
    if (selectedRecipeIds.length === 0) {
        container.innerHTML = '<p class="empty-msg">献立が選択されていません。</p>';
        completeBtnContainer.classList.add('hidden');
        return;
    }
    
    completeBtnContainer.classList.remove('hidden');
    container.innerHTML = '';
    
    const required = calculateRequiredFoods();
    let isAllSufficient = true;
    for (const [foodName, reqAmount] of Object.entries(required)) {
        const stock = inventoryStock[foodName] || 0;
        if (stock < reqAmount) {
            isAllSufficient = false;
            break;
        }
    }

    if (isAllSufficient) {
        btn.disabled = false;
        warning.classList.add('hidden');
    } else {
        btn.disabled = true;
        warning.classList.remove('hidden');
    }
    
    selectedRecipeIds.forEach(id => {
        const recipe = recipes.find(r => r.id === id);
        if (!recipe) return;
        const card = document.createElement('div');
        card.className = 'cooking-recipe-card';
        let stepsHtml = '<ol class="cooking-steps">';
        recipe.steps.forEach(step => stepsHtml += `<li>${step}</li>`);
        stepsHtml += '</ol>';
        let ingredientsHtml = '<ul class="cooking-ingredients">';
        recipe.ingredients.forEach(ing => {
            const foodMaster = foods.find(f => f.name === ing.foodName);
            const unit = foodMaster ? foodMaster.cookingUnit : '';
            ingredientsHtml += `<li><strong>${ing.foodName}:</strong> ${ing.amount} ${unit}</li>`;
        });
        ingredientsHtml += '</ul>';
        card.innerHTML = `
            <h3>${recipe.name}</h3>
            <div class="recipe-section"><h4>材料</h4>${ingredientsHtml}</div>
            <div class="recipe-section"><h4>手順</h4>${stepsHtml}</div>
        `;
        container.appendChild(card);
    });
}

function completeCooking() {
    if (!confirm('調理を完了し、今日の献立で使用した食材を在庫から減らしますか？')) return;
    const required = calculateRequiredFoods();
    for (const [foodName, reqAmount] of Object.entries(required)) {
        const currentStock = inventoryStock[foodName] || 0;
        inventoryStock[foodName] = Math.max(0, currentStock - reqAmount);
    }
    localStorage.setItem('cookingInventoryStock', JSON.stringify(inventoryStock));
    selectedRecipeIds = [];
    localStorage.setItem('cookingSelectedRecipes', JSON.stringify(selectedRecipeIds));
    shoppingChecked = {};
    localStorage.setItem('cookingShoppingChecked', JSON.stringify(shoppingChecked));
    alert('調理お疲れ様でした！在庫を消費し、献立をリセットしました。');
    renderMenuRecipes();
    renderInventory();
    renderShoppingList();
    renderCooking();
}

function toggleUnitEditMode() {
    isUnitEditMode = !isUnitEditMode;
    const btn = document.getElementById('edit-unit-btn');
    btn.textContent = isUnitEditMode ? '完了' : '編集';
    document.getElementById('settings').classList.toggle('unit-edit-active', isUnitEditMode);
}

function renderUnits() {
    const listElement = document.getElementById('unit-list');
    listElement.innerHTML = '';
    units.forEach((unit, index) => {
        const li = document.createElement('li');
        li.textContent = unit;
        const btn = document.createElement('button');
        btn.textContent = '×';
        btn.className = 'unit-delete-btn';
        btn.onclick = () => { if(isUnitEditMode) { units.splice(index, 1); saveUnitsAndRender(); } };
        li.appendChild(btn);
        listElement.appendChild(li);
    });
    updateSelectOptions();
    updateModalUnitOptions();
    updateAllRecipeIngredientSelects();
}

function addUnit() {
    const input = document.getElementById('new-unit-input');
    const val = input.value.trim();
    if (val && !units.includes(val)) { units.push(val); input.value = ''; saveUnitsAndRender(); }
}
function saveUnitsAndRender() { localStorage.setItem('cookingUnits', JSON.stringify(units)); renderUnits(); }

function updateModalUnitOptions() {
    const cookSelect = document.getElementById('modal-cooking-unit');
    const shopSelect = document.getElementById('modal-shopping-unit');
    if(!cookSelect || !shopSelect) return;
    cookSelect.innerHTML = '<option value="">料理用...</option>';
    shopSelect.innerHTML = '<option value="">購入用...</option>';
    units.forEach(unit => {
        cookSelect.appendChild(new Option(unit, unit));
        shopSelect.appendChild(new Option(unit, unit));
    });
}

function updateSelectOptions() {
    const cookSelect = document.getElementById('cooking-unit-select');
    const shopSelect = document.getElementById('shopping-unit-select');
    if(!cookSelect || !shopSelect) return;
    cookSelect.innerHTML = '<option value="">料理用...</option>';
    shopSelect.innerHTML = '<option value="">購入用...</option>';
    units.forEach(unit => {
        cookSelect.appendChild(new Option(unit, unit));
        shopSelect.appendChild(new Option(unit, unit));
    });
}

function openRecipeModal() {
    resetRecipeForm();
    document.getElementById('modal-title').textContent = 'レシピの登録';
    document.getElementById('recipe-modal').classList.remove('hidden');
}

function addRecipeIngredientRow(foodName = '', amount = '') {
    const container = document.getElementById('recipe-ingredients-container');
    const row = document.createElement('div');
    row.className = 'dynamic-row ingredient-row';
    const select = document.createElement('select');
    select.className = 'recipe-food-select';
    select.innerHTML = '<option value="">食材を選択...</option>';
    foods.forEach(f => select.appendChild(new Option(f.name, f.name)));
    select.value = foodName;
    select.onchange = function() {
        const selectedFood = foods.find(f => f.name === this.value);
        this.parentElement.querySelector('.unit-text').textContent = selectedFood ? selectedFood.cookingUnit : '-';
    };
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'recipe-amount-input';
    input.placeholder = '分量';
    input.value = amount;
    const unitSpan = document.createElement('span');
    unitSpan.className = 'unit-text';
    const initialFood = foods.find(f => f.name === foodName);
    unitSpan.textContent = initialFood ? initialFood.cookingUnit : '-';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() { row.remove(); };
    row.appendChild(select); row.appendChild(input); row.appendChild(unitSpan); row.appendChild(removeBtn);
    container.appendChild(row);
}

function addRecipeStepRow(stepText = '') {
    const container = document.getElementById('recipe-steps-container');
    const row = document.createElement('div');
    row.className = 'dynamic-row step-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'step-input';
    input.placeholder = '手順を記入';
    input.value = stepText;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() { row.remove(); };
    row.appendChild(input); row.appendChild(removeBtn);
    container.appendChild(row);
}

function updateAllRecipeIngredientSelects() {
    const selects = document.querySelectorAll('.recipe-food-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">食材を選択...</option>';
        foods.forEach(f => select.appendChild(new Option(f.name, f.name)));
        select.value = currentValue; 
    });
}

function saveRecipe() {
    const name = document.getElementById('recipe-name-input').value.trim();
    if (!name) return alert('レシピ名を入力してください。');
    const ingredients = [];
    document.querySelectorAll('.ingredient-row').forEach(row => {
        const foodName = row.querySelector('.recipe-food-select').value;
        const amount = row.querySelector('.recipe-amount-input').value;
        if (foodName && amount) ingredients.push({ foodName, amount });
    });
    const steps = [];
    document.querySelectorAll('.step-row').forEach(row => {
        const step = row.querySelector('.step-input').value.trim();
        if (step) steps.push(step);
    });
    const newRecipe = { id: editingRecipeId || Date.now(), name, ingredients, steps };
    if (editingRecipeId) {
        const index = recipes.findIndex(r => r.id === editingRecipeId);
        if (index > -1) recipes[index] = newRecipe;
    } else {
        recipes.push(newRecipe);
    }
    localStorage.setItem('cookingRecipes', JSON.stringify(recipes));
    renderRecipes();
    renderMenuRecipes();
    renderInventory();
    renderShoppingList();
    renderCooking();
    closeModal('recipe-modal');
}

function resetRecipeForm() {
    document.getElementById('recipe-name-input').value = '';
    document.getElementById('recipe-ingredients-container').innerHTML = '';
    document.getElementById('recipe-steps-container').innerHTML = '';
    editingRecipeId = null;
    document.getElementById('recipe-submit-btn').textContent = 'レシピを保存';
    addRecipeIngredientRow();
    addRecipeStepRow();
}

function renderRecipes() {
    const listElement = document.getElementById('settings-recipe-list');
    listElement.innerHTML = '';
    recipes.forEach(recipe => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="food-name-display">${recipe.name}</span> <span class="recipe-card-meta">材料: ${recipe.ingredients.length}品 / 手順: ${recipe.steps.length}</span>`;
        const btnGroup = document.createElement('div');
        btnGroup.className = 'action-buttons';
        const editBtn = document.createElement('button');
        editBtn.textContent = '編集'; editBtn.className = 'modify-btn';
        editBtn.onclick = () => loadRecipeToForm(recipe.id);
        const delBtn = document.createElement('button');
        delBtn.textContent = '削除'; delBtn.className = 'delete-btn';
        delBtn.onclick = () => {
            if(confirm(`「${recipe.name}」を削除しますか？`)) {
                recipes = recipes.filter(r => r.id !== recipe.id);
                localStorage.setItem('cookingRecipes', JSON.stringify(recipes));
                selectedRecipeIds = selectedRecipeIds.filter(id => id !== recipe.id);
                localStorage.setItem('cookingSelectedRecipes', JSON.stringify(selectedRecipeIds));
                renderRecipes(); renderMenuRecipes(); renderInventory(); renderShoppingList(); renderCooking();
            }
        };
        btnGroup.appendChild(editBtn); btnGroup.appendChild(delBtn);
        li.appendChild(btnGroup);
        listElement.appendChild(li);
    });
}

function loadRecipeToForm(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    document.getElementById('recipe-name-input').value = recipe.name;
    document.getElementById('recipe-ingredients-container').innerHTML = '';
    document.getElementById('recipe-steps-container').innerHTML = '';
    recipe.ingredients.forEach(ing => addRecipeIngredientRow(ing.foodName, ing.amount));
    recipe.steps.forEach(step => addRecipeStepRow(step));
    editingRecipeId = id;
    document.getElementById('modal-title').textContent = 'レシピの編集';
    document.getElementById('recipe-submit-btn').textContent = 'レシピを更新';
    document.getElementById('recipe-modal').classList.remove('hidden');
}