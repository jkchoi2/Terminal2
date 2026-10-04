// 실행 프로필 이름 (--profile=<이름>) 처리. main과 테스트에서 쓴다.

/** 프로필 이름: 글자/숫자/한글/_/- 만, 30자까지. 숫자만은 안 됨 (Config-Terminal2-2.json 등 실행 순번 파일과 겹침) */
export function cleanProfileName(name: string): string {
  const s = name.trim().replace(/[^\w가-힣-]/g, '').slice(0, 30)
  return /^\d*$/.test(s) ? '' : s
}

/** 명령줄의 --profile=<이름> (없으면 '') */
export function profileFromArgs(argv: string[]): string {
  const arg = argv.find((a) => a.startsWith('--profile='))
  return arg ? cleanProfileName(arg.slice('--profile='.length)) : ''
}
