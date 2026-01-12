import { defineStore } from "pinia";

export const useCatsStore = defineStore('cats', {
    state: () => ({
        lastCats: []
    }),
    actions: {
        addCat(id, status, data) {
            this.lastCats.push({
                id,
                status,
                data,
                timestamp: new Date().toISOString()
            })
            if ( this.lastCats.length > 10 ) this.lastCats.shift()
        }
    }
})