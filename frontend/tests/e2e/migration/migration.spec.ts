import { expect, test } from '@playwright/test'
import { API_URL, signUpAndLogin } from '../support/api-helpers'
import { legacyDatabaseExists, legacyFixture, PIN, seedLegacy } from '../support/legacy-seed'

test.describe('legacy IndexedDB import @migration', () => {
  test('moves a seeded v21 database to the account and deletes it', async ({ page }) => {
    await page.goto('/')
    await seedLegacy(page, legacyFixture({ withKeys: true }))
    const user = await signUpAndLogin(page)
    await page.reload()

    const modal = page.getByTestId('migration-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('button', { name: /close/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(modal).toBeVisible()

    await modal.getByRole('button', { name: 'Start' }).click()
    await modal.getByLabel('Old PIN').fill(PIN)
    await modal.getByRole('button', { name: 'Unlock keys' }).click()
    await expect(modal.getByText('Verified 22 stores and 3 media files. Local copy deleted.')).toBeVisible({ timeout: 60_000 })
    expect(await legacyDatabaseExists(page)).toBe(false)

    const keys = await page.request.get(`${API_URL}/api/keys`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    expect((await keys.json()).filter((key: { source: string }) => key.source === 'user')).toHaveLength(3)

    await modal.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Greetings, renamed').first()).toBeVisible()
    await expect(page.getByText('March lesson').first()).toBeVisible()

    await page.reload()
    await expect(page.getByText('Greetings, renamed').first()).toBeVisible()
    await expect(page.getByTestId('migration-modal')).toHaveCount(0)
  })

  test('shows no modal on a browser without legacy data', async ({ page }) => {
    await signUpAndLogin(page)
    await page.goto('/')
    await expect(page.getByTestId('migration-modal')).toHaveCount(0)
    expect(await legacyDatabaseExists(page)).toBe(false)
  })
})
