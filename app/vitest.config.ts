import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// 순수 함수(패킷 구분, 체크섬, HEX, 패턴, 연결 주소) 단위 테스트
export default defineConfig({
  resolve: { alias: { '@': resolve('src/renderer/src') } },
  test: {
    include: ['src/**/__tests__/*.test.ts'],
    environment: 'node'
  }
})
