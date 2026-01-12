import { defineStore } from "pinia";

export const useCatsStore = defineStore('cats', {
    state: () => ({
        lastCats: []
    }),
    actions: {
        addCat(id, status, data, type = 'success') {
            this.lastCats.push({ id, status, data, type, timestamp: new Date().toISOString() });

            if (this.lastCats.length > 10) {
                this.lastCats = this.lastCats.slice(-10);
            }
        }
    }
})