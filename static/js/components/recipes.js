// Recipe Management Component
const RecipeManager = {
    // Current recipe data
    currentRecipe: {
        name: '',
        ingredients: [],
        steps: []
    },
    
    // Initialize the recipe manager
    init: function() {
        // Add event listeners
        document.getElementById('addIngredientBtn').addEventListener('click', this.showIngredientModal.bind(this));
        document.getElementById('saveIngredientBtn').addEventListener('click', this.addIngredient.bind(this));
        document.getElementById('addStepBtn').addEventListener('click', this.addStep.bind(this));
        document.getElementById('saveRecipeBtn').addEventListener('click', this.saveRecipe.bind(this));
        document.getElementById('clearRecipeBtn').addEventListener('click', this.clearRecipe.bind(this));
        document.getElementById('refreshRecipesBtn').addEventListener('click', this.loadRecipes.bind(this));
        
        // Initialize recipe form
        this.clearRecipe();
        
        // Load existing recipes
        this.loadRecipes();
        
        // Initialize ingredient modal
        this.ingredientModal = new bootstrap.Modal(document.getElementById('ingredientModal'));
    },
    
    // Show the ingredient modal
    showIngredientModal: function() {
        // Reset form fields
        document.getElementById('ingredientFeeder').value = '1';
        document.getElementById('ingredientName').value = '';
        document.getElementById('ingredientAmount').value = '100';
        
        // Show the modal
        this.ingredientModal.show();
    },
    
    // Add ingredient to the recipe
    addIngredient: function() {
        const feeder = document.getElementById('ingredientFeeder').value;
        const name = document.getElementById('ingredientName').value;
        const amount = document.getElementById('ingredientAmount').value;
        
        if (!name || !amount) {
            addLogEntry('Please enter ingredient name and amount', 'error');
            return;
        }
        
        const ingredient = {
            feeder: feeder,
            name: name,
            amount: parseFloat(amount)
        };
        
        // Add to current recipe
        this.currentRecipe.ingredients.push(ingredient);
        
        // Update the UI
        this.renderIngredientsList();
        
        // Close the modal
        this.ingredientModal.hide();
    },
    
    // Render the ingredients list
    renderIngredientsList: function() {
        const container = document.getElementById('ingredientsList');
        container.innerHTML = '';
        
        this.currentRecipe.ingredients.forEach((ingredient, index) => {
            const ingredientEl = document.createElement('div');
            ingredientEl.className = 'ingredient-item d-flex justify-content-between align-items-center p-2 mb-1 border rounded';
            
            const details = document.createElement('div');
            details.textContent = `${ingredient.name} (${ingredient.amount}g) - Feeder ${ingredient.feeder}`;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger';
            removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
            removeBtn.addEventListener('click', () => this.removeIngredient(index));
            
            ingredientEl.appendChild(details);
            ingredientEl.appendChild(removeBtn);
            container.appendChild(ingredientEl);
        });
    },
    
    // Remove an ingredient
    removeIngredient: function(index) {
        this.currentRecipe.ingredients.splice(index, 1);
        this.renderIngredientsList();
    },
    
    // Add a step to the recipe
    addStep: function() {
        const stepType = prompt('Enter step type (feeder, water, mixer):');
        
        if (!stepType) return;
        
        let step = { type: stepType };
        
        switch (stepType.toLowerCase()) {
            case 'feeder':
                const feederNum = prompt('Enter feeder number (1-7):');
                const amount = prompt('Enter amount (g):');
                step.feeder = parseInt(feederNum);
                step.amount = parseFloat(amount);
                step.command = `feeder${feederNum}+${amount}`;
                break;
                
            case 'water':
                const waterAmount = prompt('Enter water amount (g):');
                step.amount = parseFloat(waterAmount);
                step.command = `water+${waterAmount}`;
                break;
                
            case 'mixer':
                const speed = prompt('Enter mixer speed (0-255):');
                step.speed = parseInt(speed);
                step.command = `mixerspeed+${speed}`;
                break;
                
            default:
                addLogEntry('Unknown step type. Use: feeder, water, or mixer', 'error');
                return;
        }
        
        // Add to current recipe
        this.currentRecipe.steps.push(step);
        
        // Update the UI
        this.renderStepsList();
    },
    
    // Render the steps list
    renderStepsList: function() {
        const container = document.getElementById('stepsList');
        container.innerHTML = '';
        
        this.currentRecipe.steps.forEach((step, index) => {
            const stepEl = document.createElement('div');
            stepEl.className = 'step-item d-flex justify-content-between align-items-center p-2 mb-1 border rounded';
            
            let description = '';
            
            switch (step.type.toLowerCase()) {
                case 'feeder':
                    description = `Feeder ${step.feeder}: Add ${step.amount}g`;
                    break;
                case 'water':
                    description = `Water: Add ${step.amount}g`;
                    break;
                case 'mixer':
                    description = `Mixer: Set speed to ${step.speed}`;
                    break;
            }
            
            const details = document.createElement('div');
            details.textContent = `${index + 1}. ${description}`;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger';
            removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
            removeBtn.addEventListener('click', () => this.removeStep(index));
            
            stepEl.appendChild(details);
            stepEl.appendChild(removeBtn);
            container.appendChild(stepEl);
        });
    },
    
    // Remove a step
    removeStep: function(index) {
        this.currentRecipe.steps.splice(index, 1);
        this.renderStepsList();
    },
    
    // Save the current recipe
    saveRecipe: function() {
        const name = document.getElementById('recipeName').value;
        
        if (!name) {
            addLogEntry('Please enter a recipe name', 'error');
            return;
        }
        
        this.currentRecipe.name = name;
        
        if (this.currentRecipe.ingredients.length === 0 && this.currentRecipe.steps.length === 0) {
            addLogEntry('Recipe must have at least one ingredient or step', 'error');
            return;
        }
        
        // Send to server
        fetch('/api/recipes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.currentRecipe)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    addLogEntry(data.message, 'system');
                    this.clearRecipe();
                    this.loadRecipes();
                } else {
                    addLogEntry(data.error, 'error');
                }
            })
            .catch(error => {
                addLogEntry(`Failed to save recipe: ${error.message}`, 'error');
            });
    },
    
    // Clear the current recipe
    clearRecipe: function() {
        this.currentRecipe = {
            name: '',
            ingredients: [],
            steps: []
        };
        
        document.getElementById('recipeName').value = '';
        this.renderIngredientsList();
        this.renderStepsList();
    },
    
    // Load saved recipes from the server
    loadRecipes: function() {
        fetch('/api/recipes')
            .then(response => response.json())
            .then(recipes => {
                const tbody = document.getElementById('recipesTable');
                tbody.innerHTML = '';
                
                recipes.forEach(recipe => {
                    const row = document.createElement('tr');
                    
                    // Name column
                    const nameCell = document.createElement('td');
                    nameCell.textContent = recipe.name;
                    
                    // Ingredients column
                    const ingredientsCell = document.createElement('td');
                    ingredientsCell.textContent = recipe.ingredients.length;
                    
                    // Steps column
                    const stepsCell = document.createElement('td');
                    stepsCell.textContent = recipe.steps.length;
                    
                    // Actions column
                    const actionsCell = document.createElement('td');
                    
                    const loadBtn = document.createElement('button');
                    loadBtn.className = 'btn btn-sm btn-primary me-1';
                    loadBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                    loadBtn.title = 'Execute Recipe';
                    loadBtn.addEventListener('click', () => this.executeRecipe(recipe));
                    
                    const editBtn = document.createElement('button');
                    editBtn.className = 'btn btn-sm btn-secondary me-1';
                    editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
                    editBtn.title = 'Edit Recipe';
                    editBtn.addEventListener('click', () => this.editRecipe(recipe));
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-sm btn-danger';
                    deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
                    deleteBtn.title = 'Delete Recipe';
                    deleteBtn.addEventListener('click', () => this.deleteRecipe(recipe.filename));
                    
                    actionsCell.appendChild(loadBtn);
                    actionsCell.appendChild(editBtn);
                    actionsCell.appendChild(deleteBtn);
                    
                    row.appendChild(nameCell);
                    row.appendChild(ingredientsCell);
                    row.appendChild(stepsCell);
                    row.appendChild(actionsCell);
                    
                    tbody.appendChild(row);
                });
            })
            .catch(error => {
                addLogEntry(`Failed to load recipes: ${error.message}`, 'error');
            });
    },
    
    // Execute a recipe
    executeRecipe: function(recipe) {
        if (!isConnected) {
            addLogEntry('Please connect to the device first', 'error');
            return;
        }
        
        if (confirm(`Execute recipe "${recipe.name}"?`)) {
            // Extract commands from steps
            const commands = recipe.steps.map(step => step.command);
            
            // Use batch endpoint to execute
            fetch('/api/batch/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    commands: commands,
                    delay: 2 // 2 second delay between commands
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        addLogEntry(`Executing recipe: ${recipe.name}`, 'system');
                    } else {
                        addLogEntry(data.error, 'error');
                    }
                })
                .catch(error => {
                    addLogEntry(`Failed to execute recipe: ${error.message}`, 'error');
                });
        }
    },
    
    // Edit a recipe
    editRecipe: function(recipe) {
        this.currentRecipe = JSON.parse(JSON.stringify(recipe)); // Deep copy
        
        document.getElementById('recipeName').value = recipe.name;
        this.renderIngredientsList();
        this.renderStepsList();
        
        // Switch to recipe tab
        const tab = document.getElementById('recipes-tab');
        bootstrap.Tab.getOrCreateInstance(tab).show();
    },
    
    // Delete a recipe
    deleteRecipe: function(filename) {
        if (confirm('Are you sure you want to delete this recipe?')) {
            fetch(`/api/recipes/${filename}`, {
                method: 'DELETE'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        addLogEntry(data.message, 'system');
                        this.loadRecipes();
                    } else {
                        addLogEntry(data.error, 'error');
                    }
                })
                .catch(error => {
                    addLogEntry(`Failed to delete recipe: ${error.message}`, 'error');
                });
        }
    }
};

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    RecipeManager.init();
}); 