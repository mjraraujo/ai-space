/**
 * compiler.js — A complete compiler for a JavaScript-like language.
 * Stages: Lexer → Parser → AST → Semantic Analyzer → IR Generator → Optimizer → Code Generator
 */

// ─── Token types ─────────────────────────────────────────────────────────────
export const TokenKind = Object.freeze({
  // Literals
  NUMBER:'NUMBER', STRING:'STRING', TEMPLATE:'TEMPLATE', BOOL:'BOOL', NULL:'NULL', UNDEFINED:'UNDEFINED',
  IDENT:'IDENT', REGEX:'REGEX',
  // Keywords
  LET:'let', CONST:'const', VAR:'var', FUNCTION:'function', RETURN:'return',
  IF:'if', ELSE:'else', WHILE:'while', FOR:'for', OF:'of', IN:'in',
  DO:'do', BREAK:'break', CONTINUE:'continue', SWITCH:'switch', CASE:'case', DEFAULT:'default',
  CLASS:'class', EXTENDS:'extends', SUPER:'super', NEW:'new', THIS:'this',
  IMPORT:'import', EXPORT:'export', FROM:'from', DEFAULT_KW:'default',
  TRY:'try', CATCH:'catch', FINALLY:'finally', THROW:'throw',
  TYPEOF:'typeof', INSTANCEOF:'instanceof', VOID:'void', DELETE_KW:'delete',
  ASYNC:'async', AWAIT:'await', YIELD:'yield', STATIC:'static', GET:'get', SET:'set',
  ARROW:'=>', SPREAD:'...', OPTIONAL_CHAIN:'?.', NULL_COALESCE:'??',
  // Punctuation
  SEMI:';', COMMA:',', DOT:'.', COLON:':', QMARK:'?',
  LPAREN:'(', RPAREN:')', LBRACE:'{', RBRACE:'}', LBRACKET:'[', RBRACKET:']',
  // Operators
  ASSIGN:'=', PLUS_ASSIGN:'+=', MINUS_ASSIGN:'-=', MUL_ASSIGN:'*=', DIV_ASSIGN:'/=',
  MOD_ASSIGN:'%=', POW_ASSIGN:'**=', AND_ASSIGN:'&&=', OR_ASSIGN:'||=', NULL_ASSIGN:'??=',
  BIT_AND_ASSIGN:'&=', BIT_OR_ASSIGN:'|=', BIT_XOR_ASSIGN:'^=', SHL_ASSIGN:'<<=',
  SHR_ASSIGN:'>>=', USHR_ASSIGN:'>>>=',
  EQ:'==', NEQ:'!=', EEQ:'===', NEEQ:'!==',
  LT:'<', GT:'>', LTE:'<=', GTE:'>=',
  PLUS:'+', MINUS:'-', STAR:'*', SLASH:'/', MOD:'%', POW:'**',
  AMP:'&', PIPE:'|', CARET:'^', TILDE:'~', SHL:'<<', SHR:'>>', USHR:'>>>',
  AND:'&&', OR:'||', NOT:'!', INC:'++', DEC:'--',
  EOF:'EOF',
});

const KW = new Set(['let','const','var','function','return','if','else','while','for','of','in',
  'do','break','continue','switch','case','default','class','extends','super','new','this',
  'import','export','from','try','catch','finally','throw','typeof','instanceof','void',
  'delete','async','await','yield','static','get','set','true','false','null','undefined']);

// ─── Source Location ──────────────────────────────────────────────────────────
class SourceLoc {
  constructor(line,col,file='<anon>') { this.line=line; this.col=col; this.file=file; }
  toString() { return `${this.file}:${this.line}:${this.col}`; }
}

// ─── Token ────────────────────────────────────────────────────────────────────
export class Token {
  constructor(kind,val,loc) { this.kind=kind; this.val=val; this.loc=loc; }
  toString() { return `Token(${this.kind}, ${this.val})`; }
}

// ─── Compiler Lexer ───────────────────────────────────────────────────────────
export class CompilerLexer {
  constructor(src,file='<anon>') {
    this.src=src; this.pos=0; this.line=1; this.col=1; this.file=file;
  }
  loc() { return new SourceLoc(this.line,this.col,this.file); }
  peek(off=0) { return this.src[this.pos+off]??''; }
  advance() {
    const c=this.src[this.pos++];
    if(c==='\n'){this.line++;this.col=1;}else{this.col++;}
    return c;
  }
  skipLineComment() { while(this.pos<this.src.length&&this.peek()!=='\n') this.advance(); }
  skipBlockComment() {
    this.advance();this.advance();
    while(this.pos<this.src.length){
      if(this.peek()==='*'&&this.peek(1)==='/'){this.advance();this.advance();return;}
      this.advance();
    }
    throw new Error('Unterminated block comment');
  }
  skipWS() {
    while(this.pos<this.src.length){
      const c=this.peek();
      if(c===' '||c==='\t'||c==='\r'||c==='\n'){this.advance();}
      else if(c==='/'&&this.peek(1)==='/'){this.skipLineComment();}
      else if(c==='/'&&this.peek(1)==='*'){this.skipBlockComment();}
      else break;
    }
  }
  readString(q) {
    let s='';
    while(this.pos<this.src.length){
      const c=this.advance();
      if(c==='\\'){
        const e=this.advance();
        if(e==='n')s+='\n';else if(e==='t')s+='\t';else if(e==='r')s+='\r';
        else if(e==='\\')s+='\\';else if(e===q)s+=q;else s+='\\'+e;
      }else if(c===q)break;
      else s+=c;
    }
    return s;
  }
  readTemplate() {
    let s=''; const parts=[];
    while(this.pos<this.src.length){
      const c=this.advance();
      if(c==='`') break;
      if(c==='$'&&this.peek()==='{') {
        parts.push({type:'str',val:s}); s=''; this.advance();
        const exprTokens=[];
        let depth=1;
        while(depth>0&&this.pos<this.src.length){
          const tok=this.nextToken();
          if(tok.kind==='{')depth++;
          else if(tok.kind==='}'){depth--;if(depth===0)break;}
          exprTokens.push(tok);
        }
        parts.push({type:'expr',tokens:exprTokens});
      } else if(c==='\\') {
        const e=this.advance();
        if(e==='n')s+='\n';else if(e==='t')s+='\t';else s+=e;
      } else s+=c;
    }
    parts.push({type:'str',val:s});
    return parts;
  }
  readNumber() {
    let s=''; const start=this.pos;
    if(this.peek()==='0'&&(this.peek(1)==='x'||this.peek(1)==='X')){
      s+=this.advance()+this.advance();
      while(/[0-9a-fA-F_]/.test(this.peek()))s+=this.advance();
      return s.replace(/_/g,'');
    }
    if(this.peek()==='0'&&(this.peek(1)==='b'||this.peek(1)==='B')){
      s+=this.advance()+this.advance();
      while(/[01_]/.test(this.peek()))s+=this.advance();
      return s.replace(/_/g,'');
    }
    while(/[\d_]/.test(this.peek()))s+=this.advance();
    if(this.peek()==='.'&&/\d/.test(this.peek(1))){s+=this.advance();while(/[\d_]/.test(this.peek()))s+=this.advance();}
    if(this.peek()==='e'||this.peek()==='E'){
      s+=this.advance();
      if(this.peek()==='+'||this.peek()==='-')s+=this.advance();
      while(/\d/.test(this.peek()))s+=this.advance();
    }
    if(this.peek()==='n')this.advance(); // BigInt suffix
    return s.replace(/_/g,'');
  }
  readIdent() {
    let s='';
    while(/[\w$]/.test(this.peek())) s+=this.advance();
    return s;
  }
  nextToken() {
    this.skipWS();
    if(this.pos>=this.src.length) return new Token(TokenKind.EOF,null,this.loc());
    const loc=this.loc(); const c=this.peek();

    if(c==='"'||c==="'"){this.advance();return new Token(TokenKind.STRING,this.readString(c),loc);}
    if(c==='`'){this.advance();return new Token(TokenKind.TEMPLATE,this.readTemplate(),loc);}
    if(/\d/.test(c)){return new Token(TokenKind.NUMBER,this.readNumber(),loc);}
    if(c==='.'&&/\d/.test(this.peek(1))){return new Token(TokenKind.NUMBER,this.readNumber(),loc);}
    if(/[a-zA-Z_$]/.test(c)){
      const id=this.readIdent();
      if(id==='true'||id==='false') return new Token(TokenKind.BOOL,id==='true',loc);
      if(id==='null') return new Token(TokenKind.NULL,null,loc);
      if(id==='undefined') return new Token(TokenKind.UNDEFINED,undefined,loc);
      const kw=TokenKind[id.toUpperCase()]||id;
      if(KW.has(id)) return new Token(id,id,loc);
      return new Token(TokenKind.IDENT,id,loc);
    }

    this.advance();
    switch(c){
      case ';': return new Token(TokenKind.SEMI,';',loc);
      case ',': return new Token(TokenKind.COMMA,',',loc);
      case ':': return new Token(TokenKind.COLON,':',loc);
      case '(': return new Token(TokenKind.LPAREN,'(',loc);
      case ')': return new Token(TokenKind.RPAREN,')',loc);
      case '{': return new Token(TokenKind.LBRACE,'{',loc);
      case '}': return new Token(TokenKind.RBRACE,'}',loc);
      case '[': return new Token(TokenKind.LBRACKET,'[',loc);
      case ']': return new Token(TokenKind.RBRACKET,']',loc);
      case '~': return new Token(TokenKind.TILDE,'~',loc);
      case '.':
        if(this.peek()==='.'&&this.peek(1)==='.'){this.advance();this.advance();return new Token(TokenKind.SPREAD,'...',loc);}
        return new Token(TokenKind.DOT,'.',loc);
      case '?':
        if(this.peek()==='?'){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.NULL_ASSIGN,'??=',loc);}return new Token(TokenKind.NULL_COALESCE,'??',loc);}
        if(this.peek()==='.'){this.advance();return new Token(TokenKind.OPTIONAL_CHAIN,'?.',loc);}
        return new Token(TokenKind.QMARK,'?',loc);
      case '+':
        if(this.peek()==='+'){this.advance();return new Token(TokenKind.INC,'++',loc);}
        if(this.peek()==='='){this.advance();return new Token(TokenKind.PLUS_ASSIGN,'+=',loc);}
        return new Token(TokenKind.PLUS,'+',loc);
      case '-':
        if(this.peek()==='-'){this.advance();return new Token(TokenKind.DEC,'--',loc);}
        if(this.peek()==='='){this.advance();return new Token(TokenKind.MINUS_ASSIGN,'-=',loc);}
        if(this.peek()==='>'){this.advance();return new Token(TokenKind.ARROW,'=>',loc);}
        return new Token(TokenKind.MINUS,'-',loc);
      case '*':
        if(this.peek()==='*'){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.POW_ASSIGN,'**=',loc);}return new Token(TokenKind.POW,'**',loc);}
        if(this.peek()==='='){this.advance();return new Token(TokenKind.MUL_ASSIGN,'*=',loc);}
        return new Token(TokenKind.STAR,'*',loc);
      case '/':
        if(this.peek()==='='){this.advance();return new Token(TokenKind.DIV_ASSIGN,'/=',loc);}
        return new Token(TokenKind.SLASH,'/',loc);
      case '%':
        if(this.peek()==='='){this.advance();return new Token(TokenKind.MOD_ASSIGN,'%=',loc);}
        return new Token(TokenKind.MOD,'%',loc);
      case '=':
        if(this.peek()==='='){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.EEQ,'===',loc);}return new Token(TokenKind.EQ,'==',loc);}
        if(this.peek()==='>'){this.advance();return new Token(TokenKind.ARROW,'=>',loc);}
        return new Token(TokenKind.ASSIGN,'=',loc);
      case '!':
        if(this.peek()==='='){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.NEEQ,'!==',loc);}return new Token(TokenKind.NEQ,'!=',loc);}
        return new Token(TokenKind.NOT,'!',loc);
      case '<':
        if(this.peek()==='<'){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.SHL_ASSIGN,'<<=',loc);}return new Token(TokenKind.SHL,'<<',loc);}
        if(this.peek()==='='){this.advance();return new Token(TokenKind.LTE,'<=',loc);}
        return new Token(TokenKind.LT,'<',loc);
      case '>':
        if(this.peek()==='>'){ this.advance();
          if(this.peek()==='>'){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.USHR_ASSIGN,'>>>=',loc);}return new Token(TokenKind.USHR,'>>>',loc);}
          if(this.peek()==='='){this.advance();return new Token(TokenKind.SHR_ASSIGN,'>>=',loc);}
          return new Token(TokenKind.SHR,'>>',loc);
        }
        if(this.peek()==='='){this.advance();return new Token(TokenKind.GTE,'>=',loc);}
        return new Token(TokenKind.GT,'>',loc);
      case '&':
        if(this.peek()==='&'){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.AND_ASSIGN,'&&=',loc);}return new Token(TokenKind.AND,'&&',loc);}
        if(this.peek()==='='){this.advance();return new Token(TokenKind.BIT_AND_ASSIGN,'&=',loc);}
        return new Token(TokenKind.AMP,'&',loc);
      case '|':
        if(this.peek()==='|'){this.advance();if(this.peek()==='='){this.advance();return new Token(TokenKind.OR_ASSIGN,'||=',loc);}return new Token(TokenKind.OR,'||',loc);}
        if(this.peek()==='='){this.advance();return new Token(TokenKind.BIT_OR_ASSIGN,'|=',loc);}
        return new Token(TokenKind.PIPE,'|',loc);
      case '^':
        if(this.peek()==='='){this.advance();return new Token(TokenKind.BIT_XOR_ASSIGN,'^=',loc);}
        return new Token(TokenKind.CARET,'^',loc);
      default: return new Token(TokenKind.IDENT,c,loc);
    }
  }
  tokenize() {
    const tokens=[];
    while(true){
      const t=this.nextToken();
      tokens.push(t);
      if(t.kind===TokenKind.EOF) break;
    }
    return tokens;
  }
}

// ─── AST Node types ───────────────────────────────────────────────────────────
export const NodeType = Object.freeze({
  Program:'Program', Block:'Block', VarDecl:'VarDecl', FuncDecl:'FuncDecl',
  ClassDecl:'ClassDecl', Return:'Return', If:'If', While:'While', DoWhile:'DoWhile',
  For:'For', ForIn:'ForIn', ForOf:'ForOf', Break:'Break', Continue:'Continue',
  Switch:'Switch', Try:'Try', Throw:'Throw', ExprStmt:'ExprStmt',
  Import:'Import', Export:'Export',
  // Expressions
  Assign:'Assign', Ternary:'Ternary', Binary:'Binary', Unary:'Unary', Update:'Update',
  Call:'Call', New:'New', Member:'Member', Index:'Index', Arrow:'Arrow',
  Func:'Func', Class:'Class', Literal:'Literal', Ident:'Ident', Array:'Array',
  Object:'Object', Spread:'Spread', Template:'Template', Await:'Await', Yield:'Yield',
  Sequence:'Sequence', TaggedTemplate:'TaggedTemplate', OptionalChain:'OptionalChain',
  NullCoalesce:'NullCoalesce', Typeof:'Typeof', Delete:'Delete', Void:'Void',
  Instanceof:'Instanceof',
});

function node(type,props,loc) { return{...props,nodeType:type,loc}; }

// ─── Parser ───────────────────────────────────────────────────────────────────
export class CompilerParser {
  constructor(tokens) {
    this.tokens=tokens; this.pos=0;
  }
  cur() { return this.tokens[this.pos]??new Token(TokenKind.EOF,null,new SourceLoc(0,0)); }
  peek(off=1) { return this.tokens[this.pos+off]??new Token(TokenKind.EOF,null,new SourceLoc(0,0)); }
  advance() { const t=this.cur(); if(this.pos<this.tokens.length-1)this.pos++; return t; }
  check(...kinds) { return kinds.includes(this.cur().kind); }
  match(...kinds) { if(this.check(...kinds)){return this.advance();} return null; }
  expect(kind) {
    if(!this.check(kind)) throw new Error(`Expected '${kind}' but got '${this.cur().kind}' ('${this.cur().val}') at ${this.cur().loc}`);
    return this.advance();
  }

  parse() {
    const loc=this.cur().loc;
    const body=[];
    while(!this.check(TokenKind.EOF)) body.push(this.parseStatement());
    return node(NodeType.Program,{body},loc);
  }

  parseStatement() {
    const t=this.cur();
    if(t.kind==='let'||t.kind==='const'||t.kind==='var') return this.parseVarDecl();
    if(t.kind==='function') return this.parseFuncDecl();
    if(t.kind==='class') return this.parseClassDecl();
    if(t.kind==='return') return this.parseReturn();
    if(t.kind==='if') return this.parseIf();
    if(t.kind==='while') return this.parseWhile();
    if(t.kind==='do') return this.parseDoWhile();
    if(t.kind==='for') return this.parseFor();
    if(t.kind==='break') { this.advance(); const label=this.check(TokenKind.IDENT)?this.advance().val:null; this.match(TokenKind.SEMI); return node(NodeType.Break,{label},t.loc); }
    if(t.kind==='continue') { this.advance(); const label=this.check(TokenKind.IDENT)?this.advance().val:null; this.match(TokenKind.SEMI); return node(NodeType.Continue,{label},t.loc); }
    if(t.kind==='switch') return this.parseSwitch();
    if(t.kind==='try') return this.parseTry();
    if(t.kind==='throw') { this.advance(); const arg=this.parseExpr(); this.match(TokenKind.SEMI); return node(NodeType.Throw,{arg},t.loc); }
    if(t.kind==='import') return this.parseImport();
    if(t.kind==='export') return this.parseExport();
    if(t.kind===TokenKind.LBRACE) return this.parseBlock();
    if(t.kind===TokenKind.SEMI) { this.advance(); return node(NodeType.ExprStmt,{expr:null},t.loc); }
    const expr=this.parseExpr();
    this.match(TokenKind.SEMI);
    return node(NodeType.ExprStmt,{expr},t.loc);
  }

  parseVarDecl() {
    const loc=this.cur().loc; const kind=this.advance().kind;
    const decls=[];
    do {
      const pattern=this.parsePattern();
      let init=null;
      if(this.match(TokenKind.ASSIGN)) init=this.parseAssignExpr();
      decls.push({pattern,init});
    } while(this.match(TokenKind.COMMA));
    this.match(TokenKind.SEMI);
    return node(NodeType.VarDecl,{kind,decls},loc);
  }

  parsePattern() {
    const t=this.cur();
    if(t.kind===TokenKind.LBRACKET) {
      this.advance(); const elements=[];
      while(!this.check(TokenKind.RBRACKET,TokenKind.EOF)){
        if(this.check(TokenKind.COMMA)){elements.push(null);this.advance();continue;}
        if(this.match(TokenKind.SPREAD)){elements.push({type:'rest',pattern:this.parsePattern()});break;}
        const p=this.parsePattern();
        let def=null;
        if(this.match(TokenKind.ASSIGN)) def=this.parseAssignExpr();
        elements.push({type:'elem',pattern:p,default:def});
        this.match(TokenKind.COMMA);
      }
      this.expect(TokenKind.RBRACKET);
      return{type:'array',elements};
    }
    if(t.kind===TokenKind.LBRACE) {
      this.advance(); const props=[];
      while(!this.check(TokenKind.RBRACE,TokenKind.EOF)){
        if(this.match(TokenKind.SPREAD)){props.push({type:'rest',pattern:this.parsePattern()});break;}
        const key=this.advance().val;
        let pattern={type:'ident',name:key};
        if(this.match(TokenKind.COLON)) pattern=this.parsePattern();
        let def=null;
        if(this.match(TokenKind.ASSIGN)) def=this.parseAssignExpr();
        props.push({type:'prop',key,pattern,default:def});
        this.match(TokenKind.COMMA);
      }
      this.expect(TokenKind.RBRACE);
      return{type:'object',props};
    }
    const name=this.expect(TokenKind.IDENT).val;
    return{type:'ident',name};
  }

  parseFuncDecl() {
    const loc=this.cur().loc; this.advance();
    const isGenerator=!!this.match(TokenKind.STAR);
    const name=this.check(TokenKind.IDENT)?this.advance().val:null;
    const{params,rest}=this.parseParams();
    const body=this.parseBlock();
    return node(NodeType.FuncDecl,{name,params,rest,body,generator:isGenerator,async:false},loc);
  }

  parseParams() {
    this.expect(TokenKind.LPAREN);
    const params=[]; let rest=null;
    while(!this.check(TokenKind.RPAREN,TokenKind.EOF)){
      if(this.match(TokenKind.SPREAD)){rest=this.parsePattern();break;}
      const pattern=this.parsePattern();
      let def=null;
      if(this.match(TokenKind.ASSIGN)) def=this.parseAssignExpr();
      params.push({pattern,default:def});
      if(!this.match(TokenKind.COMMA)) break;
    }
    this.expect(TokenKind.RPAREN);
    return{params,rest};
  }

  parseBlock() {
    const loc=this.cur().loc;
    this.expect(TokenKind.LBRACE);
    const body=[];
    while(!this.check(TokenKind.RBRACE,TokenKind.EOF)) body.push(this.parseStatement());
    this.expect(TokenKind.RBRACE);
    return node(NodeType.Block,{body},loc);
  }

  parseClassDecl() {
    const loc=this.cur().loc; this.advance();
    const name=this.check(TokenKind.IDENT)?this.advance().val:null;
    let superClass=null;
    if(this.match('extends')) superClass=this.parseLeftHandSide();
    this.expect(TokenKind.LBRACE);
    const members=[];
    while(!this.check(TokenKind.RBRACE,TokenKind.EOF)){
      const isStatic=!!this.match('static');
      const isAsync=!!this.match('async');
      const isGenerator=!!this.match(TokenKind.STAR);
      const isGet=!isGenerator&&this.check('get')&&!this.check(TokenKind.LPAREN);
      const isSet=!isGenerator&&this.check('set')&&!this.check(TokenKind.LPAREN);
      if(isGet||isSet) this.advance();
      const key=this.check(TokenKind.LBRACKET)?
        (this.advance(),this.parseAssignExpr().also?.((e)=>this.expect(TokenKind.RBRACKET))||this.parseAssignExpr()):
        this.advance().val;
      if(this.check(TokenKind.LPAREN)||isGenerator||isAsync){
        const{params,rest}=this.parseParams();
        const body=this.parseBlock();
        members.push({type:'method',key,params,rest,body,static:isStatic,async:isAsync,generator:isGenerator,get:isGet,set:isSet});
      } else {
        let init=null;
        if(this.match(TokenKind.ASSIGN)) init=this.parseAssignExpr();
        this.match(TokenKind.SEMI);
        members.push({type:'field',key,init,static:isStatic});
      }
    }
    this.expect(TokenKind.RBRACE);
    return node(NodeType.ClassDecl,{name,superClass,members},loc);
  }

  parseReturn() {
    const loc=this.cur().loc; this.advance();
    const arg=!this.check(TokenKind.SEMI,TokenKind.RBRACE,TokenKind.EOF)?this.parseExpr():null;
    this.match(TokenKind.SEMI);
    return node(NodeType.Return,{arg},loc);
  }

  parseIf() {
    const loc=this.cur().loc; this.advance();
    this.expect(TokenKind.LPAREN); const test=this.parseExpr(); this.expect(TokenKind.RPAREN);
    const consequent=this.parseStatement();
    let alternate=null;
    if(this.match('else')) alternate=this.parseStatement();
    return node(NodeType.If,{test,consequent,alternate},loc);
  }

  parseWhile() {
    const loc=this.cur().loc; this.advance();
    this.expect(TokenKind.LPAREN); const test=this.parseExpr(); this.expect(TokenKind.RPAREN);
    const body=this.parseStatement();
    return node(NodeType.While,{test,body},loc);
  }

  parseDoWhile() {
    const loc=this.cur().loc; this.advance();
    const body=this.parseStatement();
    this.expect('while'); this.expect(TokenKind.LPAREN);
    const test=this.parseExpr(); this.expect(TokenKind.RPAREN); this.match(TokenKind.SEMI);
    return node(NodeType.DoWhile,{body,test},loc);
  }

  parseFor() {
    const loc=this.cur().loc; this.advance();
    this.expect(TokenKind.LPAREN);
    if(this.check('let','const','var')&&(this.peek().kind==='in'||this.peek().kind==='of'||(this.peek().kind===TokenKind.IDENT&&(this.tokens[this.pos+2]?.kind==='in'||this.tokens[this.pos+2]?.kind==='of')))) {
      const declKind=this.advance().kind;
      const pattern=this.parsePattern();
      if(this.match('of')){
        const right=this.parseAssignExpr(); this.expect(TokenKind.RPAREN);
        return node(NodeType.ForOf,{declKind,pattern,right,body:this.parseStatement()},loc);
      }
      if(this.match('in')){
        const right=this.parseExpr(); this.expect(TokenKind.RPAREN);
        return node(NodeType.ForIn,{declKind,pattern,right,body:this.parseStatement()},loc);
      }
    }
    let init=null;
    if(!this.check(TokenKind.SEMI)){
      if(this.check('let','const','var')) init=this.parseVarDecl();
      else { init=node(NodeType.ExprStmt,{expr:this.parseExpr()},loc); this.match(TokenKind.SEMI); }
    } else this.advance();
    const test=!this.check(TokenKind.SEMI)?this.parseExpr():null; this.expect(TokenKind.SEMI);
    const update=!this.check(TokenKind.RPAREN)?this.parseExpr():null;
    this.expect(TokenKind.RPAREN);
    return node(NodeType.For,{init,test,update,body:this.parseStatement()},loc);
  }

  parseSwitch() {
    const loc=this.cur().loc; this.advance();
    this.expect(TokenKind.LPAREN); const disc=this.parseExpr(); this.expect(TokenKind.RPAREN);
    this.expect(TokenKind.LBRACE);
    const cases=[];
    while(!this.check(TokenKind.RBRACE,TokenKind.EOF)){
      let test=null;
      if(this.match('case')) test=this.parseExpr();
      else this.expect('default');
      this.expect(TokenKind.COLON);
      const body=[];
      while(!this.check('case','default',TokenKind.RBRACE,TokenKind.EOF)) body.push(this.parseStatement());
      cases.push({test,body});
    }
    this.expect(TokenKind.RBRACE);
    return node(NodeType.Switch,{disc,cases},loc);
  }

  parseTry() {
    const loc=this.cur().loc; this.advance();
    const block=this.parseBlock();
    let handler=null, finalizer=null;
    if(this.match('catch')){
      let param=null;
      if(this.check(TokenKind.LPAREN)){this.advance();param=this.parsePattern();this.expect(TokenKind.RPAREN);}
      handler={param,body:this.parseBlock()};
    }
    if(this.match('finally')) finalizer=this.parseBlock();
    return node(NodeType.Try,{block,handler,finalizer},loc);
  }

  parseImport() {
    const loc=this.cur().loc; this.advance();
    if(this.check(TokenKind.STRING)){
      const src=this.advance().val; this.match(TokenKind.SEMI);
      return node(NodeType.Import,{specifiers:[],src},loc);
    }
    const specifiers=[];
    if(this.check(TokenKind.STAR)){
      this.advance(); this.expect('as');
      specifiers.push({type:'namespace',local:this.advance().val});
    } else if(this.check(TokenKind.LBRACE)){
      this.advance();
      while(!this.check(TokenKind.RBRACE)){
        const imported=this.advance().val;
        const local=this.match('as')?this.advance().val:imported;
        specifiers.push({type:'named',imported,local});
        this.match(TokenKind.COMMA);
      }
      this.expect(TokenKind.RBRACE);
    } else {
      specifiers.push({type:'default',local:this.advance().val});
      if(this.match(TokenKind.COMMA)){
        if(this.check(TokenKind.STAR)){this.advance();this.expect('as');specifiers.push({type:'namespace',local:this.advance().val});}
        else if(this.check(TokenKind.LBRACE)){this.advance();while(!this.check(TokenKind.RBRACE)){const im=this.advance().val;const lc=this.match('as')?this.advance().val:im;specifiers.push({type:'named',imported:im,local:lc});this.match(TokenKind.COMMA);}this.expect(TokenKind.RBRACE);}
      }
    }
    this.expect('from'); const src=this.expect(TokenKind.STRING).val; this.match(TokenKind.SEMI);
    return node(NodeType.Import,{specifiers,src},loc);
  }

  parseExport() {
    const loc=this.cur().loc; this.advance();
    if(this.match('default')){
      const decl=this.parseAssignExpr(); this.match(TokenKind.SEMI);
      return node(NodeType.Export,{default:true,decl},loc);
    }
    if(this.check('function','class','let','const','var')){
      return node(NodeType.Export,{default:false,decl:this.parseStatement()},loc);
    }
    const specifiers=[];
    this.expect(TokenKind.LBRACE);
    while(!this.check(TokenKind.RBRACE)){
      const local=this.advance().val;
      const exported=this.match('as')?this.advance().val:local;
      specifiers.push({local,exported}); this.match(TokenKind.COMMA);
    }
    this.expect(TokenKind.RBRACE);
    let src=null;
    if(this.match('from')) src=this.advance().val;
    this.match(TokenKind.SEMI);
    return node(NodeType.Export,{default:false,specifiers,src},loc);
  }

  parseExpr() {
    const loc=this.cur().loc;
    const first=this.parseAssignExpr();
    if(!this.check(TokenKind.COMMA)) return first;
    const exprs=[first];
    while(this.match(TokenKind.COMMA)) exprs.push(this.parseAssignExpr());
    return node(NodeType.Sequence,{exprs},loc);
  }

  parseAssignExpr() {
    const loc=this.cur().loc;
    let left=this.parseTernary();
    const ASSIGN_OPS=[TokenKind.ASSIGN,TokenKind.PLUS_ASSIGN,TokenKind.MINUS_ASSIGN,
      TokenKind.MUL_ASSIGN,TokenKind.DIV_ASSIGN,TokenKind.MOD_ASSIGN,TokenKind.POW_ASSIGN,
      TokenKind.AND_ASSIGN,TokenKind.OR_ASSIGN,TokenKind.NULL_ASSIGN,
      TokenKind.BIT_AND_ASSIGN,TokenKind.BIT_OR_ASSIGN,TokenKind.BIT_XOR_ASSIGN,
      TokenKind.SHL_ASSIGN,TokenKind.SHR_ASSIGN,TokenKind.USHR_ASSIGN];
    if(this.check(...ASSIGN_OPS)){
      const op=this.advance().kind;
      const right=this.parseAssignExpr();
      return node(NodeType.Assign,{op,left,right},loc);
    }
    return left;
  }

  parseTernary() {
    const loc=this.cur().loc;
    let test=this.parseNullCoalesce();
    if(this.match(TokenKind.QMARK)){
      const consequent=this.parseAssignExpr();
      this.expect(TokenKind.COLON);
      const alternate=this.parseAssignExpr();
      return node(NodeType.Ternary,{test,consequent,alternate},loc);
    }
    return test;
  }

  parseNullCoalesce() {
    let left=this.parseOr();
    while(this.check(TokenKind.NULL_COALESCE)){
      const loc=this.cur().loc; this.advance();
      left=node(NodeType.NullCoalesce,{left,right:this.parseOr()},loc);
    }
    return left;
  }

  parseOr() {
    let left=this.parseAnd();
    while(this.check(TokenKind.OR)){const loc=this.cur().loc;this.advance();left=node(NodeType.Binary,{op:'||',left,right:this.parseAnd()},loc);}
    return left;
  }
  parseAnd() {
    let left=this.parseBitOr();
    while(this.check(TokenKind.AND)){const loc=this.cur().loc;this.advance();left=node(NodeType.Binary,{op:'&&',left,right:this.parseBitOr()},loc);}
    return left;
  }
  parseBitOr() {
    let left=this.parseBitXor();
    while(this.check(TokenKind.PIPE)){const loc=this.cur().loc;this.advance();left=node(NodeType.Binary,{op:'|',left,right:this.parseBitXor()},loc);}
    return left;
  }
  parseBitXor() {
    let left=this.parseBitAnd();
    while(this.check(TokenKind.CARET)){const loc=this.cur().loc;this.advance();left=node(NodeType.Binary,{op:'^',left,right:this.parseBitAnd()},loc);}
    return left;
  }
  parseBitAnd() {
    let left=this.parseEquality();
    while(this.check(TokenKind.AMP)){const loc=this.cur().loc;this.advance();left=node(NodeType.Binary,{op:'&',left,right:this.parseEquality()},loc);}
    return left;
  }
  parseEquality() {
    let left=this.parseRelational();
    while(this.check(TokenKind.EQ,TokenKind.NEQ,TokenKind.EEQ,TokenKind.NEEQ)){
      const loc=this.cur().loc;const op=this.advance().kind;
      left=node(NodeType.Binary,{op,left,right:this.parseRelational()},loc);
    }
    return left;
  }
  parseRelational() {
    let left=this.parseShift();
    while(this.check(TokenKind.LT,TokenKind.GT,TokenKind.LTE,TokenKind.GTE,'instanceof','in')){
      const loc=this.cur().loc;const op=this.advance().kind;
      if(op==='instanceof') return node(NodeType.Instanceof,{left,right:this.parseShift()},loc);
      left=node(NodeType.Binary,{op,left,right:this.parseShift()},loc);
    }
    return left;
  }
  parseShift() {
    let left=this.parseAdd();
    while(this.check(TokenKind.SHL,TokenKind.SHR,TokenKind.USHR)){
      const loc=this.cur().loc;const op=this.advance().kind;
      left=node(NodeType.Binary,{op,left,right:this.parseAdd()},loc);
    }
    return left;
  }
  parseAdd() {
    let left=this.parseMul();
    while(this.check(TokenKind.PLUS,TokenKind.MINUS)){
      const loc=this.cur().loc;const op=this.advance().kind;
      left=node(NodeType.Binary,{op,left,right:this.parseMul()},loc);
    }
    return left;
  }
  parseMul() {
    let left=this.parseExponential();
    while(this.check(TokenKind.STAR,TokenKind.SLASH,TokenKind.MOD)){
      const loc=this.cur().loc;const op=this.advance().kind;
      left=node(NodeType.Binary,{op,left,right:this.parseExponential()},loc);
    }
    return left;
  }
  parseExponential() {
    const loc=this.cur().loc;
    const left=this.parseUnary();
    if(this.match(TokenKind.POW)) return node(NodeType.Binary,{op:'**',left,right:this.parseExponential()},loc);
    return left;
  }
  parseUnary() {
    const loc=this.cur().loc;
    if(this.check(TokenKind.NOT)){this.advance();return node(NodeType.Unary,{op:'!',expr:this.parseUnary()},loc);}
    if(this.check(TokenKind.MINUS)){this.advance();return node(NodeType.Unary,{op:'-',expr:this.parseUnary()},loc);}
    if(this.check(TokenKind.PLUS)){this.advance();return node(NodeType.Unary,{op:'+',expr:this.parseUnary()},loc);}
    if(this.check(TokenKind.TILDE)){this.advance();return node(NodeType.Unary,{op:'~',expr:this.parseUnary()},loc);}
    if(this.check('typeof')){this.advance();return node(NodeType.Typeof,{expr:this.parseUnary()},loc);}
    if(this.check('void')){this.advance();return node(NodeType.Void,{expr:this.parseUnary()},loc);}
    if(this.check('delete')){this.advance();return node(NodeType.Delete,{expr:this.parseUnary()},loc);}
    if(this.check('await')){this.advance();return node(NodeType.Await,{expr:this.parseUnary()},loc);}
    if(this.check(TokenKind.INC)){this.advance();return node(NodeType.Update,{op:'++',prefix:true,expr:this.parseUnary()},loc);}
    if(this.check(TokenKind.DEC)){this.advance();return node(NodeType.Update,{op:'--',prefix:true,expr:this.parseUnary()},loc);}
    return this.parsePostfix();
  }
  parsePostfix() {
    const loc=this.cur().loc;
    let expr=this.parseLeftHandSide();
    if(this.check(TokenKind.INC)){this.advance();return node(NodeType.Update,{op:'++',prefix:false,expr},loc);}
    if(this.check(TokenKind.DEC)){this.advance();return node(NodeType.Update,{op:'--',prefix:false,expr},loc);}
    return expr;
  }
  parseLeftHandSide() {
    let expr=this.parsePrimary();
    while(true){
      if(this.check(TokenKind.DOT)){
        const loc=this.cur().loc; this.advance();
        const prop=this.advance().val;
        expr=node(NodeType.Member,{obj:expr,prop,computed:false},loc);
      } else if(this.check(TokenKind.LBRACKET)){
        const loc=this.cur().loc; this.advance();
        const prop=this.parseExpr(); this.expect(TokenKind.RBRACKET);
        expr=node(NodeType.Index,{obj:expr,prop,computed:true},loc);
      } else if(this.check(TokenKind.OPTIONAL_CHAIN)){
        const loc=this.cur().loc; this.advance();
        if(this.check(TokenKind.LPAREN)){
          const args=this.parseArgs();
          expr=node(NodeType.OptionalChain,{obj:expr,call:true,args},loc);
        } else if(this.check(TokenKind.LBRACKET)){
          this.advance();const prop=this.parseExpr();this.expect(TokenKind.RBRACKET);
          expr=node(NodeType.OptionalChain,{obj:expr,prop,computed:true},loc);
        } else {
          const prop=this.advance().val;
          expr=node(NodeType.OptionalChain,{obj:expr,prop,computed:false},loc);
        }
      } else if(this.check(TokenKind.LPAREN)){
        const loc=this.cur().loc;
        const args=this.parseArgs();
        expr=node(NodeType.Call,{callee:expr,args},loc);
      } else break;
    }
    return expr;
  }
  parseArgs() {
    this.expect(TokenKind.LPAREN); const args=[];
    while(!this.check(TokenKind.RPAREN,TokenKind.EOF)){
      if(this.match(TokenKind.SPREAD)) args.push(node(NodeType.Spread,{expr:this.parseAssignExpr()},this.cur().loc));
      else args.push(this.parseAssignExpr());
      if(!this.match(TokenKind.COMMA)) break;
    }
    this.expect(TokenKind.RPAREN); return args;
  }
  parsePrimary() {
    const t=this.cur(); const loc=t.loc;
    if(t.kind===TokenKind.NUMBER){this.advance();return node(NodeType.Literal,{val:Number(t.val),raw:t.val},loc);}
    if(t.kind===TokenKind.STRING){this.advance();return node(NodeType.Literal,{val:t.val,raw:`"${t.val}"`},loc);}
    if(t.kind===TokenKind.BOOL){this.advance();return node(NodeType.Literal,{val:t.val,raw:String(t.val)},loc);}
    if(t.kind===TokenKind.NULL){this.advance();return node(NodeType.Literal,{val:null,raw:'null'},loc);}
    if(t.kind===TokenKind.UNDEFINED){this.advance();return node(NodeType.Literal,{val:undefined,raw:'undefined'},loc);}
    if(t.kind===TokenKind.TEMPLATE){this.advance();return node(NodeType.Template,{parts:t.val},loc);}
    if(t.kind===TokenKind.IDENT){
      this.advance();
      // Arrow function: ident => ...
      if(this.check(TokenKind.ARROW)){
        this.advance();
        const body=this.check(TokenKind.LBRACE)?this.parseBlock():this.parseAssignExpr();
        return node(NodeType.Arrow,{params:[{pattern:{type:'ident',name:t.val},default:null}],rest:null,body,async:false},loc);
      }
      return node(NodeType.Ident,{name:t.val},loc);
    }
    if(t.kind==='this'){this.advance();return node(NodeType.Ident,{name:'this'},loc);}
    if(t.kind==='super'){this.advance();return node(NodeType.Ident,{name:'super'},loc);}
    if(t.kind==='new'){
      this.advance();
      if(this.match(TokenKind.DOT)){this.advance();return node(NodeType.Ident,{name:'new.target'},loc);}
      const callee=this.parseLeftHandSide();
      const args=this.check(TokenKind.LPAREN)?this.parseArgs():[];
      return node(NodeType.New,{callee,args},loc);
    }
    if(t.kind===TokenKind.LPAREN){
      this.advance();
      // Arrow: () => ... or (a,b) => ...
      if(this.check(TokenKind.RPAREN)){
        this.advance();
        if(this.check(TokenKind.ARROW)){
          this.advance();
          const body=this.check(TokenKind.LBRACE)?this.parseBlock():this.parseAssignExpr();
          return node(NodeType.Arrow,{params:[],rest:null,body,async:false},loc);
        }
        return node(NodeType.Literal,{val:undefined},loc);
      }
      const exprs=[this.parseAssignExpr()];
      while(this.match(TokenKind.COMMA)) exprs.push(this.parseAssignExpr());
      this.expect(TokenKind.RPAREN);
      if(this.check(TokenKind.ARROW)){
        this.advance();
        const params=exprs.map(e=>e.nodeType===NodeType.Ident?{pattern:{type:'ident',name:e.name},default:null}:{pattern:{type:'ident',name:'_'},default:null});
        const body=this.check(TokenKind.LBRACE)?this.parseBlock():this.parseAssignExpr();
        return node(NodeType.Arrow,{params,rest:null,body,async:false},loc);
      }
      return exprs.length===1?exprs[0]:node(NodeType.Sequence,{exprs},loc);
    }
    if(t.kind===TokenKind.LBRACKET){
      this.advance(); const elements=[];
      while(!this.check(TokenKind.RBRACKET,TokenKind.EOF)){
        if(this.check(TokenKind.COMMA)){elements.push(null);this.advance();continue;}
        if(this.match(TokenKind.SPREAD)){elements.push(node(NodeType.Spread,{expr:this.parseAssignExpr()},loc));this.match(TokenKind.COMMA);continue;}
        elements.push(this.parseAssignExpr()); this.match(TokenKind.COMMA);
      }
      this.expect(TokenKind.RBRACKET);
      return node(NodeType.Array,{elements},loc);
    }
    if(t.kind===TokenKind.LBRACE){
      this.advance(); const props=[];
      while(!this.check(TokenKind.RBRACE,TokenKind.EOF)){
        if(this.match(TokenKind.SPREAD)){props.push({type:'spread',expr:this.parseAssignExpr()});this.match(TokenKind.COMMA);continue;}
        let key; let computed=false;
        if(this.check(TokenKind.LBRACKET)){this.advance();key=this.parseAssignExpr();this.expect(TokenKind.RBRACKET);computed=true;}
        else key=this.advance().val;
        if(this.check(TokenKind.COLON)){
          this.advance(); const val=this.parseAssignExpr();
          props.push({type:'init',key,val,computed});
        } else if(this.check(TokenKind.LPAREN)){
          const{params,rest}=this.parseParams();
          const body=this.parseBlock();
          props.push({type:'method',key,params,rest,body,computed});
        } else props.push({type:'shorthand',key});
        this.match(TokenKind.COMMA);
      }
      this.expect(TokenKind.RBRACE);
      return node(NodeType.Object,{props},loc);
    }
    if(t.kind==='function'){
      this.advance(); const isGen=!!this.match(TokenKind.STAR);
      const name=this.check(TokenKind.IDENT)?this.advance().val:null;
      const{params,rest}=this.parseParams(); const body=this.parseBlock();
      return node(NodeType.Func,{name,params,rest,body,generator:isGen,async:false},loc);
    }
    if(t.kind==='class'){
      const d=this.parseClassDecl();
      return node(NodeType.Class,{...d},loc);
    }
    if(t.kind==='async'){
      this.advance();
      if(this.check('function')){
        this.advance(); const isGen=!!this.match(TokenKind.STAR);
        const name=this.check(TokenKind.IDENT)?this.advance().val:null;
        const{params,rest}=this.parseParams(); const body=this.parseBlock();
        return node(NodeType.Func,{name,params,rest,body,generator:isGen,async:true},loc);
      }
      if(this.check(TokenKind.LPAREN)){
        const{params,rest}=this.parseParams();
        this.expect(TokenKind.ARROW);
        const body=this.check(TokenKind.LBRACE)?this.parseBlock():this.parseAssignExpr();
        return node(NodeType.Arrow,{params,rest,body,async:true},loc);
      }
      const ident=this.advance().val;
      if(this.check(TokenKind.ARROW)){
        this.advance();
        const body=this.check(TokenKind.LBRACE)?this.parseBlock():this.parseAssignExpr();
        return node(NodeType.Arrow,{params:[{pattern:{type:'ident',name:ident},default:null}],rest:null,body,async:true},loc);
      }
      return node(NodeType.Ident,{name:ident},loc);
    }
    if(t.kind==='yield'){this.advance();const arg=this.parseAssignExpr();return node(NodeType.Yield,{arg},loc);}
    this.advance();
    return node(NodeType.Literal,{val:t.val,raw:String(t.val)},loc);
  }
}

// ─── Scope / Symbol Table ──────────────────────────────────────────────────────
export class Scope {
  constructor(parent=null,kind='block') {
    this.parent=parent; this.kind=kind; this.symbols=new Map(); this.children=[];
    if(parent) parent.children.push(this);
  }
  define(name,info) { this.symbols.set(name,{...info,name}); return this; }
  lookup(name) {
    if(this.symbols.has(name)) return{scope:this,info:this.symbols.get(name)};
    return this.parent?this.parent.lookup(name):null;
  }
  has(name) { return this.symbols.has(name); }
  allSymbols() {
    const out=new Map(this.symbols);
    return out;
  }
}

// ─── Semantic Analyzer ────────────────────────────────────────────────────────
export class SemanticAnalyzer {
  constructor() { this.errors=[]; this.warnings=[]; this.currentScope=null; this.currentFunction=null; }
  error(msg,loc) { this.errors.push({msg,loc:loc?.toString()}); }
  warn(msg,loc) { this.warnings.push({msg,loc:loc?.toString()}); }

  analyze(program) {
    const globalScope=new Scope(null,'global');
    ['undefined','null','console','Math','JSON','Date','Array','Object','String','Number',
     'Boolean','Promise','Error','Map','Set','WeakMap','WeakSet','Symbol','Proxy','Reflect',
     'parseInt','parseFloat','isNaN','isFinite','encodeURI','decodeURI','fetch','setTimeout',
     'clearTimeout','setInterval','clearInterval','queueMicrotask','globalThis','window',
     'document','navigator','performance','crypto'].forEach(n=>globalScope.define(n,{kind:'builtin'}));
    this.currentScope=globalScope;
    this._visitProgram(program);
    return{errors:this.errors,warnings:this.warnings,scope:globalScope};
  }

  enter(kind='block') { this.currentScope=new Scope(this.currentScope,kind); }
  leave() { this.currentScope=this.currentScope.parent; }

  _visitProgram(n) {
    for(const s of n.body) this._hoistDecls(s);
    for(const s of n.body) this._visitStmt(s);
  }

  _hoistDecls(n) {
    if(!n) return;
    if(n.nodeType===NodeType.FuncDecl) { this.currentScope.define(n.name,{kind:'function'}); }
    if(n.nodeType===NodeType.VarDecl&&n.kind==='var') {
      for(const d of n.decls) this._hoistPattern(d.pattern);
    }
    if(n.nodeType===NodeType.Block) for(const s of n.body) this._hoistDecls(s);
  }

  _hoistPattern(p) {
    if(!p) return;
    if(p.type==='ident') { if(!this.currentScope.has(p.name)) this.currentScope.define(p.name,{kind:'var'}); }
    else if(p.type==='array') p.elements?.forEach(e=>e&&this._hoistPattern(e.pattern||e));
    else if(p.type==='object') p.props?.forEach(pp=>this._hoistPattern(pp.pattern));
  }

  _visitStmt(n) {
    if(!n) return;
    switch(n.nodeType) {
      case NodeType.VarDecl: this._visitVarDecl(n); break;
      case NodeType.FuncDecl: this._visitFuncDecl(n); break;
      case NodeType.ClassDecl: this._visitClassDecl(n); break;
      case NodeType.Return: if(n.arg) this._visitExpr(n.arg); break;
      case NodeType.If: this._visitExpr(n.test); this._visitStmt(n.consequent); if(n.alternate) this._visitStmt(n.alternate); break;
      case NodeType.While: this._visitExpr(n.test); this._visitStmt(n.body); break;
      case NodeType.DoWhile: this._visitStmt(n.body); this._visitExpr(n.test); break;
      case NodeType.For: if(n.init)this._visitStmt(n.init);if(n.test)this._visitExpr(n.test);if(n.update)this._visitExpr(n.update);this._visitStmt(n.body); break;
      case NodeType.ForIn: case NodeType.ForOf: this._visitExpr(n.right); this.enter(); this._definePattern(n.pattern,n.declKind); this._visitStmt(n.body); this.leave(); break;
      case NodeType.Block: this.enter(); for(const s of n.body)this._hoistDecls(s); for(const s of n.body)this._visitStmt(s); this.leave(); break;
      case NodeType.Switch: this._visitExpr(n.disc); for(const c of n.cases){if(c.test)this._visitExpr(c.test);for(const s of c.body)this._visitStmt(s);} break;
      case NodeType.Try: this._visitStmt(n.block); if(n.handler){this.enter();if(n.handler.param)this._definePattern(n.handler.param,'let');this._visitStmt(n.handler.body);this.leave();} if(n.finalizer)this._visitStmt(n.finalizer); break;
      case NodeType.Throw: this._visitExpr(n.arg); break;
      case NodeType.ExprStmt: if(n.expr) this._visitExpr(n.expr); break;
      case NodeType.Import: this._handleImport(n); break;
      case NodeType.Export: this._handleExport(n); break;
      default: break;
    }
  }

  _visitVarDecl(n) {
    for(const d of n.decls) {
      this._definePattern(d.pattern,n.kind);
      if(d.init) this._visitExpr(d.init);
    }
  }

  _definePattern(p,kind) {
    if(!p) return;
    if(p.type==='ident') { this.currentScope.define(p.name,{kind}); }
    else if(p.type==='array') p.elements?.forEach(e=>e&&this._definePattern(e.pattern,kind));
    else if(p.type==='object') p.props?.forEach(pp=>this._definePattern(pp.pattern,kind));
  }

  _visitFuncDecl(n) {
    const prevFn=this.currentFunction; this.currentFunction=n;
    this.enter('function');
    for(const p of n.params) { this._definePattern(p.pattern,'param'); if(p.default)this._visitExpr(p.default); }
    if(n.rest) this._definePattern(n.rest,'param');
    for(const s of n.body.body) this._hoistDecls(s);
    for(const s of n.body.body) this._visitStmt(s);
    this.leave(); this.currentFunction=prevFn;
  }

  _visitClassDecl(n) {
    if(n.name) this.currentScope.define(n.name,{kind:'class'});
    this.enter('class');
    if(n.superClass) this._visitExpr(n.superClass);
    for(const m of n.members) {
      if(m.type==='method') {
        this.enter('function');
        for(const p of m.params){this._definePattern(p.pattern,'param');if(p.default)this._visitExpr(p.default);}
        for(const s of m.body.body){this._hoistDecls(s);this._visitStmt(s);}
        this.leave();
      } else if(m.type==='field'&&m.init) this._visitExpr(m.init);
    }
    this.leave();
  }

  _handleImport(n) {
    for(const s of n.specifiers) this.currentScope.define(s.local,{kind:'import',src:n.src});
  }

  _handleExport(n) {
    if(n.decl) this._visitStmt(n.decl);
  }

  _visitExpr(n) {
    if(!n) return;
    switch(n.nodeType) {
      case NodeType.Literal: break;
      case NodeType.Ident:
        if(!['this','super','arguments','new.target'].includes(n.name)) {
          const res=this.currentScope.lookup(n.name);
          if(!res) this.warn(`'${n.name}' is not defined`,n.loc);
        }
        break;
      case NodeType.Binary: this._visitExpr(n.left); this._visitExpr(n.right); break;
      case NodeType.Unary: this._visitExpr(n.expr); break;
      case NodeType.Update: this._visitExpr(n.expr); break;
      case NodeType.Assign: this._visitExpr(n.left); this._visitExpr(n.right); break;
      case NodeType.Ternary: this._visitExpr(n.test); this._visitExpr(n.consequent); this._visitExpr(n.alternate); break;
      case NodeType.Call: this._visitExpr(n.callee); n.args.forEach(a=>this._visitExpr(a)); break;
      case NodeType.New: this._visitExpr(n.callee); n.args.forEach(a=>this._visitExpr(a)); break;
      case NodeType.Member: this._visitExpr(n.obj); break;
      case NodeType.Index: this._visitExpr(n.obj); this._visitExpr(n.prop); break;
      case NodeType.Array: n.elements.forEach(e=>e&&this._visitExpr(e)); break;
      case NodeType.Object: n.props.forEach(p=>{if(p.type!=='shorthand'&&p.val)this._visitExpr(p.val);else if(p.expr)this._visitExpr(p.expr);}); break;
      case NodeType.Arrow: {
        const prev=this.currentFunction; this.currentFunction=n; this.enter('arrow');
        for(const p of n.params){this._definePattern(p.pattern,'param');if(p.default)this._visitExpr(p.default);}
        if(n.rest)this._definePattern(n.rest,'param');
        if(n.body.nodeType===NodeType.Block){for(const s of n.body.body){this._hoistDecls(s);this._visitStmt(s);}}
        else this._visitExpr(n.body);
        this.leave(); this.currentFunction=prev; break;
      }
      case NodeType.Func: this._visitFuncDecl(n); break;
      case NodeType.Sequence: n.exprs.forEach(e=>this._visitExpr(e)); break;
      case NodeType.Await: this._visitExpr(n.expr); break;
      case NodeType.Yield: if(n.arg)this._visitExpr(n.arg); break;
      case NodeType.Spread: this._visitExpr(n.expr); break;
      case NodeType.NullCoalesce: this._visitExpr(n.left); this._visitExpr(n.right); break;
      case NodeType.OptionalChain: this._visitExpr(n.obj); if(n.args)n.args.forEach(a=>this._visitExpr(a)); break;
      case NodeType.Typeof: this._visitExpr(n.expr); break;
      case NodeType.Delete: this._visitExpr(n.expr); break;
      case NodeType.Void: this._visitExpr(n.expr); break;
      case NodeType.Instanceof: this._visitExpr(n.left); this._visitExpr(n.right); break;
      default: break;
    }
  }
}

// ─── IR Generator ─────────────────────────────────────────────────────────────
export class IRGen {
  constructor() { this.instrs=[]; this._tmpCount=0; this._labelCount=0; }
  tmp() { return `_t${this._tmpCount++}`; }
  label() { return `_L${this._labelCount++}`; }
  emit(op,...args) { this.instrs.push({op,...(args.length===1?{arg:args[0]}:{args})}); }
  generate(program) {
    for(const s of program.body) this._genStmt(s);
    return this.instrs;
  }
  _genStmt(n) {
    if(!n) return;
    switch(n.nodeType) {
      case NodeType.VarDecl: for(const d of n.decls){const t=d.init?this._genExpr(d.init):null;if(d.pattern.type==='ident')this.emit('STORE',d.pattern.name,t);} break;
      case NodeType.ExprStmt: if(n.expr) this._genExpr(n.expr); break;
      case NodeType.Return: { const v=n.arg?this._genExpr(n.arg):null; this.emit('RETURN',v); break; }
      case NodeType.If: {
        const cond=this._genExpr(n.test);
        const els=this.label(); const end=this.label();
        this.emit('JUMP_IF_FALSE',cond,els);
        this._genStmt(n.consequent);
        this.emit('JUMP',end);
        this.emit('LABEL',els);
        if(n.alternate) this._genStmt(n.alternate);
        this.emit('LABEL',end);
        break;
      }
      case NodeType.While: {
        const start=this.label(); const end=this.label();
        this.emit('LABEL',start);
        const cond=this._genExpr(n.test);
        this.emit('JUMP_IF_FALSE',cond,end);
        this._genStmt(n.body);
        this.emit('JUMP',start);
        this.emit('LABEL',end);
        break;
      }
      case NodeType.Block: for(const s of n.body) this._genStmt(s); break;
      case NodeType.FuncDecl: {
        const lbl=`func_${n.name}`; this.emit('FUNC_DEF',n.name,lbl,n.params.map(p=>p.pattern.name));
        const prev=this.instrs; this.instrs=[];
        this.emit('LABEL',lbl);
        this._genStmt(n.body);
        this.emit('RETURN',null);
        const body=this.instrs; this.instrs=prev;
        this.emit('FUNC_BODY',n.name,body);
        break;
      }
      case NodeType.Throw: { const v=this._genExpr(n.arg); this.emit('THROW',v); break; }
      default: break;
    }
  }
  _genExpr(n) {
    if(!n) return null;
    switch(n.nodeType) {
      case NodeType.Literal: { const t=this.tmp(); this.emit('LOAD_CONST',t,n.val); return t; }
      case NodeType.Ident: { const t=this.tmp(); this.emit('LOAD',t,n.name); return t; }
      case NodeType.Binary: {
        const l=this._genExpr(n.left); const r=this._genExpr(n.right);
        const t=this.tmp(); this.emit('BINARY',t,n.op,l,r); return t;
      }
      case NodeType.Unary: { const v=this._genExpr(n.expr); const t=this.tmp(); this.emit('UNARY',t,n.op,v); return t; }
      case NodeType.Assign: {
        const v=this._genExpr(n.right);
        if(n.left.nodeType===NodeType.Ident) this.emit('STORE',n.left.name,v);
        else if(n.left.nodeType===NodeType.Member){const obj=this._genExpr(n.left.obj);this.emit('SET_PROP',obj,n.left.prop,v);}
        return v;
      }
      case NodeType.Call: {
        const callee=this._genExpr(n.callee);
        const args=n.args.map(a=>this._genExpr(a));
        const t=this.tmp(); this.emit('CALL',t,callee,...args); return t;
      }
      case NodeType.Member: { const obj=this._genExpr(n.obj); const t=this.tmp(); this.emit('GET_PROP',t,obj,n.prop); return t; }
      case NodeType.Array: { const els=n.elements.map(e=>e?this._genExpr(e):null); const t=this.tmp(); this.emit('ARRAY',t,...els); return t; }
      case NodeType.Object: {
        const t=this.tmp(); this.emit('OBJECT',t);
        for(const p of n.props){
          if(p.type==='shorthand'){const v=this.tmp();this.emit('LOAD',v,p.key);this.emit('SET_PROP',t,p.key,v);}
          else if(p.type==='init'){const v=this._genExpr(p.val);this.emit('SET_PROP',t,p.key,v);}
        }
        return t;
      }
      case NodeType.Ternary: {
        const cond=this._genExpr(n.test); const t=this.tmp();
        const els=this.label(); const end=this.label();
        this.emit('JUMP_IF_FALSE',cond,els);
        const cv=this._genExpr(n.consequent); this.emit('MOVE',t,cv);
        this.emit('JUMP',end); this.emit('LABEL',els);
        const av=this._genExpr(n.alternate); this.emit('MOVE',t,av);
        this.emit('LABEL',end); return t;
      }
      case NodeType.New: { const callee=this._genExpr(n.callee); const args=n.args.map(a=>this._genExpr(a)); const t=this.tmp(); this.emit('NEW',t,callee,...args); return t; }
      case NodeType.Await: { const v=this._genExpr(n.expr); const t=this.tmp(); this.emit('AWAIT',t,v); return t; }
      default: { const t=this.tmp(); this.emit('LOAD_CONST',t,null); return t; }
    }
  }
}

// ─── Optimizer ────────────────────────────────────────────────────────────────
export class Optimizer {
  optimize(instrs) {
    let changed=true; let result=instrs;
    while(changed){
      changed=false;
      const pass1=this._constantFolding(result);
      if(pass1!==result){result=pass1;changed=true;}
      const pass2=this._deadCodeElimination(result);
      if(pass2!==result){result=pass2;changed=true;}
      const pass3=this._copyPropagation(result);
      if(pass3!==result){result=pass3;changed=true;}
    }
    return result;
  }

  _constantFolding(instrs) {
    const consts=new Map();
    const out=[];
    for(const ins of instrs){
      if(ins.op==='LOAD_CONST'){consts.set(ins.arg,ins.args?.[1]??ins.arg);out.push(ins);}
      else if(ins.op==='BINARY'){
        const [t,op,l,r]=ins.args||[ins.arg,...(ins.args||[])];
        const lv=consts.get(l); const rv=consts.get(r);
        if(lv!==undefined&&rv!==undefined){
          let val;
          if(op==='+')val=lv+rv;else if(op==='-')val=lv-rv;
          else if(op==='*')val=lv*rv;else if(op==='/')val=rv?lv/rv:NaN;
          else if(op==='%')val=lv%rv;else if(op==='**')val=lv**rv;
          else if(op==='===')val=lv===rv;else if(op==='!==')val=lv!==rv;
          else if(op==='<')val=lv<rv;else if(op==='>')val=lv>rv;
          else if(op==='<=')val=lv<=rv;else if(op==='>=')val=lv>=rv;
          if(val!==undefined){
            const dest=Array.isArray(ins.args)?ins.args[0]:ins.arg;
            consts.set(dest,val);
            out.push({op:'LOAD_CONST',arg:dest,args:[dest,val]});
            continue;
          }
        }
        out.push(ins);
      } else out.push(ins);
    }
    return out.length!==instrs.length||out.some((o,i)=>o!==instrs[i])?out:instrs;
  }

  _deadCodeElimination(instrs) {
    const labels=new Set();
    const jumps=new Set();
    for(const ins of instrs){
      if(ins.op==='LABEL') labels.add(ins.arg);
      if(ins.op==='JUMP') jumps.add(ins.arg);
      if(ins.op==='JUMP_IF_FALSE') jumps.add(Array.isArray(ins.args)?ins.args[1]:ins.arg);
    }
    const out=[]; let dead=false;
    for(const ins of instrs){
      if(ins.op==='LABEL'){dead=false;out.push(ins);}
      else if(dead) continue;
      else{out.push(ins);if(ins.op==='JUMP')dead=true;}
    }
    return out.length!==instrs.length?out:instrs;
  }

  _copyPropagation(instrs) {
    const copies=new Map();
    const out=[];
    const resolve=v=>copies.get(v)??v;
    for(const ins of instrs){
      if(ins.op==='MOVE'){copies.set(ins.args?.[0]??ins.arg,resolve(ins.args?.[1]??ins.arg));continue;}
      if(ins.op==='LOAD'){
        const dest=Array.isArray(ins.args)?ins.args[0]:ins.arg;
        const src=Array.isArray(ins.args)?ins.args[1]:null;
        const resolved=src?resolve(src):null;
        out.push(resolved&&resolved!==src?{...ins,args:[dest,resolved]}:ins);
        continue;
      }
      out.push(ins);
    }
    return out.length!==instrs.length||out.some((o,i)=>o!==instrs[i])?out:instrs;
  }
}

// ─── Code Generator ───────────────────────────────────────────────────────────
export class CodeGen {
  generate(ast) { return this._genProgram(ast); }
  _genProgram(n) { return n.body.map(s=>this._genStmt(s)).join('\n'); }

  _genStmt(n,indent=0) {
    const pad=' '.repeat(indent);
    if(!n) return '';
    switch(n.nodeType){
      case NodeType.VarDecl:
        return pad+n.kind+' '+n.decls.map(d=>this._genPattern(d.pattern)+(d.init?'='+this._genExpr(d.init):'')).join(',')+';';
      case NodeType.FuncDecl:
        return pad+(n.async?'async ':'')+' function'+(n.generator?'*':'')+' '+(n.name||'')+this._genParams(n.params,n.rest)+this._genBlock(n.body,indent);
      case NodeType.ClassDecl:
        return pad+'class '+(n.name||'')+(n.superClass?' extends '+this._genExpr(n.superClass):'')+' {\n'+n.members.map(m=>this._genMember(m,indent+2)).join('\n')+'\n'+pad+'}';
      case NodeType.Return:
        return pad+'return'+(n.arg?' '+this._genExpr(n.arg):'')+';';
      case NodeType.If:
        return pad+'if('+this._genExpr(n.test)+')'+this._genStmt(n.consequent,indent)+(n.alternate?'\n'+pad+'else '+this._genStmt(n.alternate,indent):'');
      case NodeType.While:
        return pad+'while('+this._genExpr(n.test)+')'+this._genStmt(n.body,indent);
      case NodeType.DoWhile:
        return pad+'do '+this._genStmt(n.body,indent)+' while('+this._genExpr(n.test)+');';
      case NodeType.For:
        return pad+'for('+this._genStmt(n.init,0).replace(/;$/,'')+';'+(n.test?this._genExpr(n.test):'')+';'+(n.update?this._genExpr(n.update):'')+')'+ this._genStmt(n.body,indent);
      case NodeType.ForIn:
        return pad+'for('+n.declKind+' '+this._genPattern(n.pattern)+' in '+this._genExpr(n.right)+')'+this._genStmt(n.body,indent);
      case NodeType.ForOf:
        return pad+'for('+n.declKind+' '+this._genPattern(n.pattern)+' of '+this._genExpr(n.right)+')'+this._genStmt(n.body,indent);
      case NodeType.Break: return pad+'break'+(n.label?' '+n.label:'')+';';
      case NodeType.Continue: return pad+'continue'+(n.label?' '+n.label:'')+';';
      case NodeType.Switch:
        return pad+'switch('+this._genExpr(n.disc)+'){\n'+n.cases.map(c=>pad+'  '+(c.test?'case '+this._genExpr(c.test)+':':'default:')+'\n'+c.body.map(s=>this._genStmt(s,indent+4)).join('\n')).join('\n')+'\n'+pad+'}';
      case NodeType.Try:
        return pad+'try '+this._genBlock(n.block,indent)+(n.handler?'\ncatch('+(n.handler.param?this._genPattern(n.handler.param):'_')+')'+this._genBlock(n.handler.body,indent):'')+(n.finalizer?'\nfinally '+this._genBlock(n.finalizer,indent):'');
      case NodeType.Throw: return pad+'throw '+this._genExpr(n.arg)+';';
      case NodeType.Block: return this._genBlock(n,indent);
      case NodeType.ExprStmt: return n.expr?pad+this._genExpr(n.expr)+';':'';
      case NodeType.Import: return pad+'import '+this._genImport(n)+';';
      case NodeType.Export: return pad+(n.default?'export default '+this._genExpr(n.decl):'export '+(n.decl?this._genStmt(n.decl,0):'{'+n.specifiers.map(s=>s.local+(s.exported!==s.local?' as '+s.exported:'')).join(',')+'}'))+';';
      default: return '';
    }
  }

  _genBlock(n,indent) {
    const pad=' '.repeat(indent);
    return '{\n'+n.body.map(s=>this._genStmt(s,indent+2)).join('\n')+'\n'+pad+'}';
  }

  _genMember(m,indent) {
    const pad=' '.repeat(indent);
    if(m.type==='field') return pad+(m.static?'static ':'')+m.key+(m.init?'='+this._genExpr(m.init):'')+';';
    return pad+(m.static?'static ':'')+( m.async?'async ':'')+( m.generator?'*':'')+(m.get?'get ':m.set?'set ':'')+m.key+this._genParams(m.params,m.rest)+this._genBlock(m.body,indent);
  }

  _genParams(params,rest) {
    const ps=params.map(p=>this._genPattern(p.pattern)+(p.default?'='+this._genExpr(p.default):''));
    if(rest) ps.push('...'+this._genPattern(rest));
    return '('+ps.join(',')+')';
  }

  _genPattern(p) {
    if(!p) return '_';
    if(p.type==='ident') return p.name;
    if(p.type==='array') return '['+p.elements.map(e=>!e?'':e.type==='rest'?'...'+this._genPattern(e.pattern):this._genPattern(e.pattern)+(e.default?'='+this._genExpr(e.default):'')).join(',')+']';
    if(p.type==='object') return '{'+p.props.map(pp=>pp.type==='rest'?'...'+this._genPattern(pp.pattern):pp.key+(pp.pattern.type!=='ident'||pp.pattern.name!==pp.key?':'+this._genPattern(pp.pattern):'')+(pp.default?'='+this._genExpr(pp.default):'')).join(',')+'}';
    return String(p);
  }

  _genImport(n) {
    if(!n.specifiers.length) return `'${n.src}'`;
    const ns=n.specifiers.find(s=>s.type==='namespace');
    if(ns) return `* as ${ns.local} from '${n.src}'`;
    const def=n.specifiers.find(s=>s.type==='default');
    const named=n.specifiers.filter(s=>s.type==='named');
    const parts=[];
    if(def) parts.push(def.local);
    if(named.length) parts.push('{'+named.map(s=>s.imported+(s.local!==s.imported?' as '+s.local:'')).join(',')+'}');
    return parts.join(',')+` from '${n.src}'`;
  }

  _genExpr(n) {
    if(!n) return 'null';
    switch(n.nodeType){
      case NodeType.Literal: return n.raw??JSON.stringify(n.val);
      case NodeType.Ident: return n.name;
      case NodeType.Binary: return '('+this._genExpr(n.left)+n.op+this._genExpr(n.right)+')';
      case NodeType.Unary: return n.op+this._genExpr(n.expr);
      case NodeType.Update: return n.prefix?n.op+this._genExpr(n.expr):this._genExpr(n.expr)+n.op;
      case NodeType.Assign: return this._genExpr(n.left)+n.op+this._genExpr(n.right);
      case NodeType.Ternary: return '('+this._genExpr(n.test)+'?'+this._genExpr(n.consequent)+':'+this._genExpr(n.alternate)+')';
      case NodeType.Call: return this._genExpr(n.callee)+'('+n.args.map(a=>this._genExpr(a)).join(',')+')';
      case NodeType.New: return 'new '+this._genExpr(n.callee)+'('+n.args.map(a=>this._genExpr(a)).join(',')+')';
      case NodeType.Member: return this._genExpr(n.obj)+'.'+n.prop;
      case NodeType.Index: return this._genExpr(n.obj)+'['+this._genExpr(n.prop)+']';
      case NodeType.Array: return '['+n.elements.map(e=>e?this._genExpr(e):'').join(',')+']';
      case NodeType.Object: return '{'+n.props.map(p=>p.type==='spread'?'...'+this._genExpr(p.expr):p.type==='shorthand'?p.key:p.type==='method'?p.key+this._genParams(p.params,p.rest)+this._genBlock(p.body,0):p.key+':'+this._genExpr(p.val)).join(',')+'}';
      case NodeType.Arrow: { const body=n.body.nodeType===NodeType.Block?this._genBlock(n.body,0):this._genExpr(n.body); return (n.async?'async ':'')+this._genParams(n.params,n.rest)+'=>'+body; }
      case NodeType.Func: return (n.async?'async ':'')+' function'+(n.generator?'*':'')+(n.name?' '+n.name:'')+this._genParams(n.params,n.rest)+this._genBlock(n.body,0);
      case NodeType.Sequence: return '('+n.exprs.map(e=>this._genExpr(e)).join(',')+')';
      case NodeType.Spread: return '...'+this._genExpr(n.expr);
      case NodeType.Await: return 'await '+this._genExpr(n.expr);
      case NodeType.Yield: return 'yield'+(n.arg?' '+this._genExpr(n.arg):'');
      case NodeType.NullCoalesce: return '('+this._genExpr(n.left)+'??'+this._genExpr(n.right)+')';
      case NodeType.OptionalChain: return this._genExpr(n.obj)+'?.'+( n.call?'('+n.args.map(a=>this._genExpr(a)).join(',')+')':(n.computed?'['+this._genExpr(n.prop)+']':n.prop));
      case NodeType.Typeof: return 'typeof '+this._genExpr(n.expr);
      case NodeType.Delete: return 'delete '+this._genExpr(n.expr);
      case NodeType.Void: return 'void '+this._genExpr(n.expr);
      case NodeType.Instanceof: return '('+this._genExpr(n.left)+' instanceof '+this._genExpr(n.right)+')';
      case NodeType.Template: return '`'+n.parts.map(p=>p.type==='str'?p.val:'${...}').join('')+'`';
      default: return '/* unknown */';
    }
  }
}

// ─── Minifier ─────────────────────────────────────────────────────────────────
export class Minifier {
  constructor() { this._varMap=new Map(); this._counter=0; }
  _shortName() {
    const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let n=this._counter++; let s='';
    do{s=chars[n%chars.length]+s;n=Math.floor(n/chars.length);}while(n>0);
    return s;
  }
  minify(src) {
    return src
      .replace(/\/\/[^\n]*/g,'')
      .replace(/\/\*[\s\S]*?\*\//g,'')
      .replace(/\s+/g,' ')
      .replace(/\s*([{};,=+\-*/<>!&|^~?:()\[\]])\s*/g,'$1')
      .replace(/\s*\.\s*/g,'.')
      .trim();
  }
}

// ─── Source Map ───────────────────────────────────────────────────────────────
export class SourceMap {
  constructor(file) { this.file=file; this.mappings=[]; }
  addMapping(gen,orig,src,name) { this.mappings.push({gen,orig,src,name}); }
  toJSON() {
    return{version:3,file:this.file,sources:[],mappings:'',names:[]};
  }
}

// ─── Compiler Pipeline ────────────────────────────────────────────────────────
export class Compiler {
  constructor(opts={}) {
    this.opts={minify:false,optimize:true,sourceMap:false,...opts};
  }
  compile(src,file='<anon>') {
    const errors=[]; const warnings=[];
    try {
      const tokens=new CompilerLexer(src,file).tokenize();
      const ast=new CompilerParser(tokens).parse();
      const semantic=new SemanticAnalyzer().analyze(ast);
      errors.push(...semantic.errors);
      warnings.push(...semantic.warnings);
      let irInstrs=null;
      if(this.opts.emitIR){
        irInstrs=new IRGen().generate(ast);
        if(this.opts.optimize) irInstrs=new Optimizer().optimize(irInstrs);
      }
      const cg=new CodeGen();
      let code=cg.generate(ast);
      if(this.opts.minify) code=new Minifier().minify(code);
      return{ok:errors.length===0,code,ast,ir:irInstrs,errors,warnings};
    } catch(e) {
      errors.push({msg:e.message});
      return{ok:false,code:null,ast:null,ir:null,errors,warnings};
    }
  }
  parse(src,file='<anon>') {
    const tokens=new CompilerLexer(src,file).tokenize();
    return new CompilerParser(tokens).parse();
  }
  analyze(src,file='<anon>') {
    const ast=this.parse(src,file);
    return new SemanticAnalyzer().analyze(ast);
  }
  tokenize(src,file='<anon>') { return new CompilerLexer(src,file).tokenize(); }
  generateCode(ast) { return new CodeGen().generate(ast); }
  buildIR(ast) { return new IRGen().generate(ast); }
  optimizeIR(ir) { return new Optimizer().optimize(ir); }
}

export function compile(src,opts={}) { return new Compiler(opts).compile(src); }
export function parse(src) { return new Compiler().parse(src); }
export function tokenize(src) { return new Compiler().tokenize(src); }
