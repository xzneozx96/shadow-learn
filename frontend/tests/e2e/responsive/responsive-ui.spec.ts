import { expect, test } from '@playwright/test'
import { seedLesson, seedSettings, signUpAndLogin } from '../support/api-helpers'

test('lesson stays usable on phone and tablet widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const user = await signUpAndLogin(page)
  await seedSettings(page.request, user, { translationLanguage: 'en', uiLanguage: 'en' })
  const lessonId = await seedLesson(page.request, user, {
    title: 'Mobile study lesson',
    source: 'youtube',
    duration: 3,
    segments: [{
      id: 'mobile-segment',
      start: 0,
      end: 3,
      text: '你好',
      romanization: 'nǐ hǎo',
      translations: { en: 'Hello' },
      words: [],
    }],
  })

  await page.goto(`/lesson/${lessonId}`)
  await expect(page.getByText('你好').first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Transcript' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play from here' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('tab', { name: 'Companion' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Companion', exact: true })).toBeVisible()
  await expect(page.getByText('Mobile study lesson')).toBeVisible()
  await page.getByRole('tab', { name: 'Transcript' }).click()
  await expect(page.getByText('你好').first()).toBeVisible()

  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.getByRole('tab', { name: 'Transcript' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.setViewportSize({ width: 320, height: 700 })
  await expect(page.getByRole('tab', { name: 'Transcript' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const mobileNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(mobileNavigation).toBeVisible()
  await mobileNavigation.getByRole('link', { name: 'Create' }).click()
  await expect(page.getByText('Create New Lesson', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  for (const route of ['/vocabulary', '/collection', '/settings', '/docs', '/changelog']) {
    await page.goto(route)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('library wheel scrolling does not call preventDefault from a passive listener', async ({ page }) => {
  const user = await signUpAndLogin(page)
  await seedSettings(page.request, user, { translationLanguage: 'en', uiLanguage: 'en' })
  for (let index = 0; index < 3; index++) {
    await seedLesson(page.request, user, {
      title: `Wheel lesson ${index}`,
      source: 'youtube',
      duration: 3,
    })
  }

  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('Unable to preventDefault inside passive event listener invocation'))
      warnings.push(message.text())
  })
  await page.goto('/')
  const carousel = page.locator('.grid-flow-col').first()
  await expect(carousel).toBeVisible()
  await carousel.hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => carousel.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  expect(warnings).toEqual([])

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(carousel.locator('a[href="/create"]')).toBeHidden()
  await expect(carousel.locator('a[href="/collection"]')).toBeHidden()
  const mobileNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(mobileNavigation.getByRole('link', { name: 'Create' })).toBeVisible()
  await expect(mobileNavigation.getByRole('link', { name: 'Explore' })).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(carousel.locator('a[href="/create"]')).toBeVisible()
  await expect(carousel.locator('a[href="/collection"]')).toBeVisible()
})

test('Vietnamese collection tabs fit equal mobile columns', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const user = await signUpAndLogin(page)
  await seedSettings(page.request, user, { translationLanguage: 'en', uiLanguage: 'vi' })
  await page.goto('/collection')

  const tabs = [
    page.getByRole('button', { name: /Luyện tập Shadowing/ }),
    page.getByRole('button', { name: /Mẹo học tập/ }),
    page.getByRole('button', { name: /Tài liệu của tôi/ }),
  ]
  const boxes = []
  for (const tab of tabs) {
    await expect(tab).toBeVisible()
    boxes.push((await tab.boundingBox())!)
  }
  expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(2)
  expect(Math.max(...boxes.map(box => box.height)) - Math.min(...boxes.map(box => box.height))).toBeLessThan(2)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
