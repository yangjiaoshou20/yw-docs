import type {ThemeCollections} from 'vuepress-theme-plume'
import {defineCollections} from 'vuepress-theme-plume'

import {frontEnd} from './front-end/index.js'
import {backEnd} from './back-end/index.js'
import {devops} from './devops/index.js'

const docs: ThemeCollections = [
    frontEnd,
    backEnd,
    devops,
]

export const collections = defineCollections(docs)
