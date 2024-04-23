#!/usr/bin/env node

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import * as fs from 'fs'
// import { exec } from 'child_process' (commented out)
import prompts from 'prompts'
import arg from 'arg'
import path from 'path'
import chalk from 'chalk'
import { URL } from 'url'
import { cwd } from 'process'
import * as utils from './utils.js'
import * as spinner from './spinner.js'
import { config as dotEnv } from 'dotenv'
const { exec } = require('child_process')
const { promisify } = require('util')
const execPromise = promisify(exec)

const __dirname = new URL('.', import.meta.url).pathname

const args = arg({
  '--help': Boolean,
  '--docs': Boolean,
  '--version': Boolean,
  '-h': '--help',
  '-d': '--docs',
  '-v': '--version'
})

if (args['--version']) {
  ; (async () => {
    const pkg = require(path.join(__dirname, 'package.json'))
    console.log(`NextWS v${pkg.version}`)
    process.exit(0)
  })()
}

if (args['--help']) {
  utils.showHelp()
  process.exit(0)
}

if (args['--docs']) {
  utils.showDocs()
  process.exit(0)
}

async function init() {
  console.clear()
  console.log(`${chalk.bold.red('Create Stack NextJS + Strapi + Websocket')}${chalk.dim.grey(' by Blade')}`)

  // Check if dock is installed
  const docker = await utils.isDockerRunning()
  if (!docker) {
    console.log(chalk.bold.red('Docker is not running. Running in lite mode.'))
    console.log(chalk.bold.red('No Strapi, no Containers. Just barebones NextJS + NextWS.'))
    console.log(chalk.bold.red('CTRL+C to exit. Autostart in 2 seconds..'))
    await utils.sleep(2000)
  }

  const project = await prompts([
    {
      type: 'text',
      name: 'projectname',
      message: chalk.bold.yellow('Name:'),
      validate: (value) => {
        const pattern = '^(?:(?:@(?:[a-z0-9-*~][a-z0-9-*._~]*)?/[a-z0-9-._~])|[a-z0-9-~])[a-z0-9-._~]*$'
        return value.match(pattern) ? true : 'Invalid project name'
      }
    },
    {
      type: 'select',
      name: 'autogen',
      message: chalk.bold.yellow('Automatic Mode:'),
      choices: [
        { title: 'Yes', description: 'Yes', value: true },
        { title: 'No', description: 'No, let me customize it', value: false }
      ]
    }
  ])

  if (!project.projectname) return
  const projectName = project.projectname
  const basePath = path.join(cwd(), projectName)
  const autogen = project.autogen
  let installNodeModules = { value: true }
  let manual = { autoenv: { value: true }, compose: { value: true }, primary: ''}
  let primary = ''
  if (autogen === false) {
    manual = await prompts([
      {
        type: 'text',
        name: 'primary',
        message: chalk.bold.yellow('Primary color (empty for default):')
      },
      {
        type: 'select',
        name: 'autoenv',
        message: chalk.bold.yellow('Auto-Generate .env:'),
        choices: [
          { title: 'No', description: 'No', value: false },
          { title: 'Yes', description: 'Yes', value: true }
        ]
      },
      {
        type: 'select',
        name: 'compose',
        message: chalk.bold.yellow('Customize compose service names?'),
        choices: [
          { title: 'No', description: 'No', value: false },
          { title: 'Yes', description: 'Yes', value: true }
        ]
      }
    ])

    primary = manual.primary
    if (autogen === false) {
      installNodeModules = await prompts([
        {
          type: 'select',
          name: 'value',
          message: chalk.bold.yellow('Install Node Modules:'),
          choices: [
            { title: 'No', description: 'No just scaffold the app', value: false },
            { title: 'Yes', description: 'Yes (this will take time)', value: true }
          ]
        }
      ])
    }
  }
  let template = { value: { repoName: 'meeting' } }
  if (autogen === false) {
    template = await prompts([
      {
        type: 'select',
        name: 'value',
        message: chalk.bold.yellow('Template:'),
        choices: [
          {
            title: 'NextJS + NextWS + Strapi',
            description: 'more might come',
            value: { repoName: 'meeting' }
          }
        ]
      }
    ])
  }
  if (!template.value) return

  let img2ico = { value: false }
  if (autogen === false) {
    img2ico = await prompts([
      {
        type: 'select',
        name: 'value',
        message: chalk.bold.yellow('Use custom icon.png:'),
        choices: [
          { title: 'No', description: 'No', value: false },
          { title: 'Yes', description: 'Yes', value: true }
        ]
      }
    ])
  }
  const { repoName, branch } = template.value
  const repo = `https://github.com/yeonv/${repoName}`

  try {
    if (fs.existsSync(projectName) && fs.statSync(projectName).isDirectory()) {
      console.error(` Directory "${projectName}" already exists.`)
      process.exit(1)
    }
    spinner.create(chalk.bold.yellow('Downloading and extracting...'))
    await utils.gitClone(repo, projectName, branch)
    fs.rmSync(path.join(cwd(), projectName, '.git'), {
      recursive: true,
      force: true
    })
    spinner.clear()
    spinner.create(chalk.bold.yellow('Configuring App...'))
    const configured = await utils.replaceStrings(projectName, primary)
    if (configured) {
      spinner.clear()
    }
    if (img2ico.value === true) {
      const img2icoConfirm = await prompts([
        {
          type: 'select',
          name: 'value',
          message: chalk`{bold.yellow Place squared ${chalk`{cyan icon.png}`} in ${chalk`{cyan ./${projectName}}`}:}`,
          choices: [
            {
              title: 'Confirm',
              description: `Placed icon.png inside of ${projectName}`,
              value: true
            },
            {
              title: 'Cancel',
              description: 'Continue without custom icon',
              value: false
            }
          ]
        }
      ])
      if (img2icoConfirm.value === true) {
        await utils.handleIcon(projectName)
      }
    }
    if (process.platform === 'win32') {
      await utils.generateEnv(`${basePath}\\.env.example`, `${basePath}\\.env`, project.autogen || manual.autoenv.value || manual.autoenv)
      await execPromise(`copy ${basePath}\\.env ${basePath}\\frontend\\.env`)
      await execPromise(`copy ${basePath}\\.env ${basePath}\\backend\\.env`)
    } else {
      await utils.generateEnv(`${basePath}/.env.example`, `${basePath}/.env`, project.autogen || manual.autoenv.value || manual.autoenv)
      await execPromise(`cp ${basePath}/.env ${basePath}/frontend/.env`)
      await execPromise(`cp ${basePath}/.env ${basePath}/backend/.env`)
    }

    if (!project.autogen) {
      if (process.platform === 'win32') {
        dotEnv({ path: `${basePath}\\.env` })
      } else {
        dotEnv({ path: `${basePath}/.env` })
      }
    }

    if (installNodeModules.value) {
      spinner.create(chalk.bold.yellow('Installing Node Modules (grab a coffee)...'))

      if (process.platform === 'win32') {
        await execPromise(`cd ${basePath}\\frontend && npm install`)
        await execPromise(`cd ${basePath}\\frontend && npx next-ws-cli@latest patch --yes`)
      } else {
        await execPromise(`cd ${basePath}/frontend && npm install`)
        await execPromise(`cd ${basePath}/frontend && npx next-ws-cli@latest patch --yes`)
      }
      spinner.clear()
    }
    if (docker) {
      const basePath = path.join(cwd(), projectName)
      // console.log('EYYYY', manual)
      if ((manual.compose === true || manual.compose.value === true) && project.autogen === false) {
        // spinner.create(chalk.bold.yellow('Configuring Docker Compose...'))
        await utils.configureDockerCompose(`${basePath}/docker-compose.yml`)
        // spinner.clear()
      }

      spinner.create(chalk.bold.yellow('Starting Docker Containers...'))

      await utils.dockerNetwork(process.env.DOCKER_NETWORK)
      await execPromise(`cd ${basePath} && docker-compose up -d`)
      spinner.clear()
    }

    await utils.sleep(2000)
    utils.showDocs(projectName, primary, img2ico.value, installNodeModules.value)
  } catch (error) {
    console.log(error)
    spinner.fail(error)
    process.exit(error)
  }
}

init()
