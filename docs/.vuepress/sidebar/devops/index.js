import {defineNoteConfig} from 'vuepress-theme-plume'

export const devops = defineNoteConfig({
    dir: 'devops',
    link: '/devops/',
    sidebar: [{
        text: '开始',
        collapsed: false,
        icon: 'ph:code-bold',
        items: [
            '开始',
        ],
    }],
})
