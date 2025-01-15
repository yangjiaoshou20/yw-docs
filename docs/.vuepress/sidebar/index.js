import {defineNotesConfig} from "vuepress-theme-plume";
import {frontEnd} from "./front-end"
import {backEnd} from "./back-end"
import {devops} from "./devops"


export const notes = defineNotesConfig({
    link: '/',
    dir: 'notes',
    icon: '/home.png',
    notes: [
        frontEnd,
        backEnd,
        devops
    ]
})

