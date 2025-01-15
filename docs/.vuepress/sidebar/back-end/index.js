import {defineNoteConfig} from 'vuepress-theme-plume'

export const backEnd = defineNoteConfig({
    dir: 'back-end',
    link: '/back/',
    sidebar: [{
        text: '开始',
        collapsed: false,
        icon: 'ph:code-bold',
        items: [
            '开始',
        ],
    }],
})
