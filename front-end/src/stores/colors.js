import { defineStore } from "pinia";

export const useColorsStore = defineStore('colors', {
    state: () => ({
        activeColor: "aqua",
        colors: [
            {
                name: "aqua",
                from: "#00a6f4",
                to: "#f0b100",
                from_100: "#e0f4fe",
                from_200: "#bae6fd",
                from_300: "#7dd1fc",
                from_400: "#38b6f9",
                from_500: "#00a6f4",
                from_500_50: "#00a6f480",
                from_600: "#0283ce",
                from_700: "#0367a6",
                from_800: "#075789",
                from_900: "#0c4971",
                from_900_50: "#0c497180",
                to_100: "#fef8e1",
                to_200: "#fef0b5",
                to_300: "#fde383",
                to_400: "#fccf4d",
                to_500: "#f0b100",
                to_500_50: "#f0b10080",
                to_600: "#d69200",
                to_700: "#a66902",
                to_800: "#865307",
                to_900: "#6f440b",
                to_900_50: "#6f440b80",
            },
            {
                name: "220",
                from: "#fb2c36",
                to: "#000000",
                from_100: "#fee2e2",
                from_200: "#fecaca",
                from_300: "#fca5a5",
                from_400: "#f87171",
                from_500: "#fb2c36",
                from_500_50: "#fb2c3680",
                from_600: "#dc2626",
                from_700: "#b91c1c",
                from_800: "#991b1b",
                from_900: "#7f1d1d",
                from_900_50: "#7f1d1d80",
                to_100: "#e5e5e5",
                to_200: "#cccccc",
                to_300: "#999999",
                to_400: "#666666",
                to_500: "#000000",
                to_500_50: "#00000080",
                to_600: "#000000",
                to_700: "#000000",
                to_800: "#000000",
                to_900: "#000000",
                to_900_50: "#00000080",
            },
            {
                name: "kungfupanda",
                from: "#00bc7d",
                to: "#62748e",
                from_100: "#d1fae5",
                from_200: "#a7f3d0",
                from_300: "#6ee7b7",
                from_400: "#34d399",
                from_500: "#00bc7d",
                from_500_50: "#00bc7d80",
                from_600: "#059669",
                from_700: "#047857",
                from_800: "#065f46",
                from_900: "#064e3b",
                from_900_50: "#064e3b80",
                to_100: "#f1f5f9",
                to_200: "#e2e8f0",
                to_300: "#cbd5e1",
                to_400: "#94a3b8",
                to_500: "#62748e",
                to_500_50: "#62748e80",
                to_600: "#475569",
                to_700: "#334155",
                to_800: "#1e293b",
                to_900: "#0f172a",
                to_900_50: "#0f172a80",
            }
        ]

    }),
    getters: {
        getActiveColor() {
            return this.colors.filter(e => e.name === this.activeColor)[0]
        }
    },
    actions: {
        /**
         * 
         * @param {String} colorName precisa ser uma string que existe em colors: []
         */
        setActiveColor(colorName) {
            this.activeColor = colorName
        }
    }
})