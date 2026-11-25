// assets/match.js + assets/trust.js → apps-script/Lib.gs (Apps Script 프로젝트에 'Lib' 파일로 붙여 넣기)
// 실행: node tools/build-gs.js   (tests/board.test.js가 Lib.gs가 최신인지 확인해요)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function build() {
  return '// 자동 생성 파일: 직접 고치지 말고 assets/match.js, assets/trust.js를 고친 뒤 node tools/build-gs.js\n\n' +
    fs.readFileSync(path.join(root, 'assets/match.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(root, 'assets/trust.js'), 'utf8');
}
if (require.main === module) { fs.writeFileSync(path.join(root, 'apps-script/Lib.gs'), build()); console.log('apps-script/Lib.gs 갱신'); }
module.exports = build;
