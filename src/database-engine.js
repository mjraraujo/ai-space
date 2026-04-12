/**
 * DatabaseEngine — full in-memory relational database with SQL-like query language.
 * Supports tables, indexes, transactions, joins, aggregates, and window functions.
 */

// ─── Token types ────────────────────────────────────────────────────────────
export const TT = Object.freeze({
  SELECT:'SELECT',INSERT:'INSERT',UPDATE:'UPDATE',DELETE:'DELETE',CREATE:'CREATE',
  DROP:'DROP',ALTER:'ALTER',FROM:'FROM',WHERE:'WHERE',JOIN:'JOIN',INNER:'INNER',
  LEFT:'LEFT',RIGHT:'RIGHT',FULL:'FULL',OUTER:'OUTER',CROSS:'CROSS',ON:'ON',
  GROUP:'GROUP',BY:'BY',HAVING:'HAVING',ORDER:'ORDER',LIMIT:'LIMIT',OFFSET:'OFFSET',
  UNION:'UNION',ALL:'ALL',DISTINCT:'DISTINCT',AS:'AS',INTO:'INTO',VALUES:'VALUES',
  SET:'SET',TABLE:'TABLE',INDEX:'INDEX',UNIQUE:'UNIQUE',PRIMARY:'PRIMARY',KEY:'KEY',
  FOREIGN:'FOREIGN',REFERENCES:'REFERENCES',NOT:'NOT',NULL_KW:'NULL',DEFAULT:'DEFAULT',
  CHECK:'CHECK',CONSTRAINT:'CONSTRAINT',AND:'AND',OR:'OR',IN:'IN',EXISTS:'EXISTS',
  BETWEEN:'BETWEEN',LIKE:'LIKE',IS:'IS',CASE:'CASE',WHEN:'WHEN',THEN:'THEN',
  ELSE:'ELSE',END:'END',OVER:'OVER',PARTITION:'PARTITION',ROW_NUMBER:'ROW_NUMBER',
  RANK:'RANK',DENSE_RANK:'DENSE_RANK',LAG:'LAG',LEAD:'LEAD',FIRST_VALUE:'FIRST_VALUE',
  LAST_VALUE:'LAST_VALUE',COUNT:'COUNT',SUM:'SUM',AVG:'AVG',MIN:'MIN',MAX:'MAX',
  COALESCE:'COALESCE',NULLIF:'NULLIF',CAST:'CAST',STAR:'STAR',COMMA:'COMMA',
  DOT:'DOT',LPAREN:'LPAREN',RPAREN:'RPAREN',SEMI:'SEMI',EQ:'EQ',NEQ:'NEQ',
  LT:'LT',GT:'GT',LTE:'LTE',GTE:'GTE',PLUS:'PLUS',MINUS:'MINUS',SLASH:'SLASH',
  PERCENT:'PERCENT',CONCAT:'CONCAT',IDENT:'IDENT',NUMBER:'NUMBER',STRING:'STRING',
  BOOL:'BOOL',NULL_LIT:'NULL_LIT',EOF:'EOF',ASC:'ASC',DESC:'DESC',
  INTEGER:'INTEGER',FLOAT_KW:'FLOAT',TEXT:'TEXT',BOOLEAN_KW:'BOOLEAN',
  DATE_KW:'DATE',TIMESTAMP:'TIMESTAMP',JSON_KW:'JSON',BLOB:'BLOB',
  BEGIN:'BEGIN',COMMIT:'COMMIT',ROLLBACK:'ROLLBACK',SAVEPOINT:'SAVEPOINT',
  RELEASE:'RELEASE',EXPLAIN:'EXPLAIN',TRUNCATE:'TRUNCATE',RENAME:'RENAME',
  ADD:'ADD',COLUMN:'COLUMN',WITH:'WITH',RECURSIVE:'RECURSIVE',
});

const KEYWORDS = new Map(Object.entries({
  select:TT.SELECT,insert:TT.INSERT,update:TT.UPDATE,delete:TT.DELETE,
  create:TT.CREATE,drop:TT.DROP,alter:TT.ALTER,from:TT.FROM,where:TT.WHERE,
  join:TT.JOIN,inner:TT.INNER,left:TT.LEFT,right:TT.RIGHT,full:TT.FULL,
  outer:TT.OUTER,cross:TT.CROSS,on:TT.ON,group:TT.GROUP,by:TT.BY,
  having:TT.HAVING,order:TT.ORDER,limit:TT.LIMIT,offset:TT.OFFSET,
  union:TT.UNION,all:TT.ALL,distinct:TT.DISTINCT,as:TT.AS,into:TT.INTO,
  values:TT.VALUES,set:TT.SET,table:TT.TABLE,index:TT.INDEX,unique:TT.UNIQUE,
  primary:TT.PRIMARY,key:TT.KEY,foreign:TT.FOREIGN,references:TT.REFERENCES,
  not:TT.NOT,null:TT.NULL_KW,default:TT.DEFAULT,check:TT.CHECK,
  constraint:TT.CONSTRAINT,and:TT.AND,or:TT.OR,in:TT.IN,exists:TT.EXISTS,
  between:TT.BETWEEN,like:TT.LIKE,is:TT.IS,case:TT.CASE,when:TT.WHEN,
  then:TT.THEN,else:TT.ELSE,end:TT.END,over:TT.OVER,partition:TT.PARTITION,
  row_number:TT.ROW_NUMBER,rank:TT.RANK,dense_rank:TT.DENSE_RANK,
  lag:TT.LAG,lead:TT.LEAD,first_value:TT.FIRST_VALUE,last_value:TT.LAST_VALUE,
  count:TT.COUNT,sum:TT.SUM,avg:TT.AVG,min:TT.MIN,max:TT.MAX,
  coalesce:TT.COALESCE,nullif:TT.NULLIF,cast:TT.CAST,true:'BOOL',false:'BOOL',
  integer:TT.INTEGER,float:TT.FLOAT_KW,text:TT.TEXT,boolean:TT.BOOLEAN_KW,
  date:TT.DATE_KW,timestamp:TT.TIMESTAMP,json:TT.JSON_KW,blob:TT.BLOB,
  begin:TT.BEGIN,commit:TT.COMMIT,rollback:TT.ROLLBACK,savepoint:TT.SAVEPOINT,
  release:TT.RELEASE,explain:TT.EXPLAIN,truncate:TT.TRUNCATE,rename:TT.RENAME,
  add:TT.ADD,column:TT.COLUMN,with:TT.WITH,recursive:TT.RECURSIVE,
  asc:TT.ASC,desc:TT.DESC,
}));

// ─── Lexer ───────────────────────────────────────────────────────────────────
export class Lexer {
  constructor(src) {
    this.src = src; this.pos = 0; this.line = 1; this.col = 1;
  }
  peek() { return this.src[this.pos] ?? ''; }
  advance() {
    const ch = this.src[this.pos++];
    if (ch === '\n') { this.line++; this.col = 1; } else { this.col++; }
    return ch;
  }
  skipWhitespace() {
    while (this.pos < this.src.length) {
      const ch = this.peek();
      if (ch === '-' && this.src[this.pos+1] === '-') {
        while (this.pos < this.src.length && this.peek() !== '\n') this.advance();
      } else if (ch === '/' && this.src[this.pos+1] === '*') {
        this.advance(); this.advance();
        while (this.pos < this.src.length) {
          if (this.peek() === '*' && this.src[this.pos+1] === '/') {
            this.advance(); this.advance(); break;
          }
          this.advance();
        }
      } else if (' \t\r\n'.includes(ch)) {
        this.advance();
      } else break;
    }
  }
  readString(q) {
    let s = '';
    while (this.pos < this.src.length) {
      const ch = this.advance();
      if (ch === q) {
        if (this.peek() === q) { s += this.advance(); }
        else break;
      } else s += ch;
    }
    return s;
  }
  readNumber() {
    let s = '';
    while (/[\d.]/.test(this.peek())) s += this.advance();
    if (this.peek() === 'e' || this.peek() === 'E') {
      s += this.advance();
      if (this.peek() === '+' || this.peek() === '-') s += this.advance();
      while (/\d/.test(this.peek())) s += this.advance();
    }
    return s;
  }
  readIdent() {
    let s = '';
    while (/[\w$]/.test(this.peek())) s += this.advance();
    return s;
  }
  tokenize() {
    const tokens = [];
    while (true) {
      this.skipWhitespace();
      if (this.pos >= this.src.length) { tokens.push({type:TT.EOF,val:null}); break; }
      const line = this.line, col = this.col;
      const ch = this.peek();
      let tok;
      if (ch === '"' || ch === "'") {
        this.advance();
        tok = {type:TT.STRING, val:this.readString(ch), line, col};
      } else if (ch === '`') {
        this.advance();
        tok = {type:TT.IDENT, val:this.readString('`'), line, col};
      } else if (/\d/.test(ch)) {
        const s = this.readNumber();
        tok = {type:TT.NUMBER, val:Number(s), line, col};
      } else if (/[a-zA-Z_$]/.test(ch)) {
        const s = this.readIdent();
        const kw = KEYWORDS.get(s.toLowerCase());
        if (kw === 'BOOL') tok = {type:TT.BOOL, val:s.toLowerCase()==='true', line, col};
        else if (kw) tok = {type:kw, val:s, line, col};
        else tok = {type:TT.IDENT, val:s, line, col};
      } else {
        this.advance();
        switch(ch) {
          case '*': tok={type:TT.STAR,val:'*',line,col}; break;
          case ',': tok={type:TT.COMMA,val:',',line,col}; break;
          case '.': tok={type:TT.DOT,val:'.',line,col}; break;
          case '(': tok={type:TT.LPAREN,val:'(',line,col}; break;
          case ')': tok={type:TT.RPAREN,val:')',line,col}; break;
          case ';': tok={type:TT.SEMI,val:';',line,col}; break;
          case '+': tok={type:TT.PLUS,val:'+',line,col}; break;
          case '/': tok={type:TT.SLASH,val:'/',line,col}; break;
          case '%': tok={type:TT.PERCENT,val:'%',line,col}; break;
          case '|':
            if (this.peek()==='|'){this.advance();tok={type:TT.CONCAT,val:'||',line,col};}
            else tok={type:TT.IDENT,val:'|',line,col};
            break;
          case '-': tok={type:TT.MINUS,val:'-',line,col}; break;
          case '=': tok={type:TT.EQ,val:'=',line,col}; break;
          case '<':
            if(this.peek()==='='){this.advance();tok={type:TT.LTE,val:'<=',line,col};}
            else if(this.peek()==='>'){this.advance();tok={type:TT.NEQ,val:'<>',line,col};}
            else tok={type:TT.LT,val:'<',line,col};
            break;
          case '>':
            if(this.peek()==='='){this.advance();tok={type:TT.GTE,val:'>=',line,col};}
            else tok={type:TT.GT,val:'>',line,col};
            break;
          case '!':
            if(this.peek()==='='){this.advance();tok={type:TT.NEQ,val:'!=',line,col};}
            else tok={type:TT.IDENT,val:'!',line,col};
            break;
          default: tok={type:TT.IDENT,val:ch,line,col};
        }
      }
      tokens.push(tok);
    }
    return tokens;
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────
export class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  peek(off=0) { return this.tokens[Math.min(this.pos+off, this.tokens.length-1)]; }
  cur() { return this.peek(0); }
  advance() { const t = this.tokens[this.pos]; if(this.pos<this.tokens.length-1)this.pos++; return t; }
  expect(type) {
    const t = this.cur();
    if(t.type!==type) throw new Error(`Expected ${type} but got ${t.type} ('${t.val}') at line ${t.line}`);
    return this.advance();
  }
  match(...types) { if(types.includes(this.cur().type)){return this.advance();} return null; }
  check(...types) { return types.includes(this.cur().type); }

  parse() {
    const stmts = [];
    while(!this.check(TT.EOF)) {
      stmts.push(this.parseStatement());
      this.match(TT.SEMI);
    }
    return stmts;
  }

  parseStatement() {
    const t = this.cur();
    if(t.type===TT.SELECT||t.type===TT.WITH) return this.parseSelect();
    if(t.type===TT.INSERT) return this.parseInsert();
    if(t.type===TT.UPDATE) return this.parseUpdate();
    if(t.type===TT.DELETE) return this.parseDelete();
    if(t.type===TT.CREATE) return this.parseCreate();
    if(t.type===TT.DROP) return this.parseDrop();
    if(t.type===TT.ALTER) return this.parseAlter();
    if(t.type===TT.BEGIN) { this.advance(); return {type:'BEGIN'}; }
    if(t.type===TT.COMMIT) { this.advance(); return {type:'COMMIT'}; }
    if(t.type===TT.ROLLBACK) { this.advance(); return {type:'ROLLBACK'}; }
    if(t.type===TT.SAVEPOINT) { this.advance(); return {type:'SAVEPOINT',name:this.advance().val}; }
    if(t.type===TT.RELEASE) { this.advance(); this.match(TT.SAVEPOINT); return {type:'RELEASE_SAVEPOINT',name:this.advance().val}; }
    if(t.type===TT.EXPLAIN) { this.advance(); return {type:'EXPLAIN',stmt:this.parseStatement()}; }
    if(t.type===TT.TRUNCATE) { this.advance(); this.match(TT.TABLE); return {type:'TRUNCATE',table:this.advance().val}; }
    throw new Error(`Unexpected token ${t.type} at line ${t.line}`);
  }

  parseSelect() {
    let ctes = null;
    if(this.check(TT.WITH)) {
      this.advance();
      const recursive = !!this.match(TT.RECURSIVE);
      ctes = []; let first = true;
      do {
        if(!first) this.expect(TT.COMMA);
        first = false;
        const name = this.advance().val;
        this.expect(TT.AS);
        this.expect(TT.LPAREN);
        const query = this.parseSelect();
        this.expect(TT.RPAREN);
        ctes.push({name, query, recursive});
      } while(this.check(TT.COMMA));
    }
    this.expect(TT.SELECT);
    const distinct = !!this.match(TT.DISTINCT);
    const columns = this.parseSelectList();
    let from=null, joins=[], where=null, groupBy=null, having=null, orderBy=null, limit=null, offset=null;
    if(this.match(TT.FROM)) {
      from = this.parseTableRef();
      while(this.check(TT.JOIN,TT.INNER,TT.LEFT,TT.RIGHT,TT.FULL,TT.CROSS)) {
        joins.push(this.parseJoin());
      }
    }
    if(this.match(TT.WHERE)) where = this.parseExpr();
    if(this.check(TT.GROUP)) {
      this.advance(); this.expect(TT.BY);
      groupBy = this.parseExprList();
    }
    if(this.match(TT.HAVING)) having = this.parseExpr();
    if(this.check(TT.ORDER)) {
      this.advance(); this.expect(TT.BY);
      orderBy = this.parseOrderByList();
    }
    if(this.match(TT.LIMIT)) limit = this.parseExpr();
    if(this.match(TT.OFFSET)) offset = this.parseExpr();
    let node = {type:'SELECT',distinct,columns,from,joins,where,groupBy,having,orderBy,limit,offset,ctes};
    if(this.match(TT.UNION)) {
      const uall = !!this.match(TT.ALL);
      const right = this.parseSelect();
      node = {type:'UNION',all:uall,left:node,right};
    }
    return node;
  }

  parseSelectList() {
    const cols = [];
    do {
      if(this.check(TT.STAR)) { this.advance(); cols.push({type:'STAR'}); continue; }
      const expr = this.parseExpr();
      let alias = null;
      if(this.match(TT.AS)) alias = this.advance().val;
      else if(this.check(TT.IDENT)&&!this.check(TT.FROM,TT.WHERE,TT.GROUP,TT.ORDER,TT.HAVING,TT.LIMIT,TT.OFFSET,TT.UNION)) {
        alias = this.advance().val;
      }
      cols.push({expr,alias});
    } while(this.match(TT.COMMA));
    return cols;
  }

  parseTableRef() {
    let name, alias=null;
    if(this.check(TT.LPAREN)) {
      this.advance();
      const subquery = this.parseSelect();
      this.expect(TT.RPAREN);
      if(this.match(TT.AS)) alias = this.advance().val;
      else alias = this.advance().val;
      return {type:'SUBQUERY',query:subquery,alias};
    }
    name = this.advance().val;
    if(this.check(TT.DOT)) { this.advance(); name = name+'.'+this.advance().val; }
    if(this.match(TT.AS)) alias = this.advance().val;
    else if(this.check(TT.IDENT)&&!this.check(TT.WHERE,TT.JOIN,TT.INNER,TT.LEFT,TT.RIGHT,TT.FULL,TT.CROSS,TT.GROUP,TT.ORDER,TT.HAVING,TT.LIMIT,TT.OFFSET,TT.UNION,TT.SET)) {
      alias = this.advance().val;
    }
    return {type:'TABLE',name,alias};
  }

  parseJoin() {
    let kind='INNER';
    if(this.match(TT.LEFT)){this.match(TT.OUTER);kind='LEFT';}
    else if(this.match(TT.RIGHT)){this.match(TT.OUTER);kind='RIGHT';}
    else if(this.match(TT.FULL)){this.match(TT.OUTER);kind='FULL';}
    else if(this.match(TT.CROSS)){kind='CROSS';}
    else if(this.match(TT.INNER)){}
    this.expect(TT.JOIN);
    const table = this.parseTableRef();
    let cond=null;
    if(this.match(TT.ON)) cond=this.parseExpr();
    return {type:'JOIN',kind,table,cond};
  }

  parseOrderByList() {
    const list=[];
    do {
      const expr=this.parseExpr();
      let dir='ASC';
      if(this.match(TT.DESC)) dir='DESC';
      else this.match(TT.ASC);
      list.push({expr,dir});
    } while(this.match(TT.COMMA));
    return list;
  }

  parseInsert() {
    this.expect(TT.INSERT); this.match(TT.INTO);
    const table=this.advance().val;
    let cols=null;
    if(this.check(TT.LPAREN)&&this.peek(1).type!==TT.SELECT) {
      this.advance(); cols=[]; let first=true;
      do { if(!first)this.expect(TT.COMMA); first=false; cols.push(this.advance().val); }
      while(this.check(TT.COMMA));
      this.expect(TT.RPAREN);
    }
    if(this.match(TT.VALUES)) {
      const rows=[];
      do {
        this.expect(TT.LPAREN);
        const vals=this.parseExprList();
        this.expect(TT.RPAREN);
        rows.push(vals);
      } while(this.match(TT.COMMA));
      return {type:'INSERT',table,cols,rows};
    }
    const select=this.parseSelect();
    return {type:'INSERT_SELECT',table,cols,select};
  }

  parseUpdate() {
    this.expect(TT.UPDATE);
    const table=this.advance().val;
    this.expect(TT.SET);
    const sets=[];
    do {
      const col=this.advance().val; this.expect(TT.EQ);
      const val=this.parseExpr();
      sets.push({col,val});
    } while(this.match(TT.COMMA));
    let where=null;
    if(this.match(TT.WHERE)) where=this.parseExpr();
    return {type:'UPDATE',table,sets,where};
  }

  parseDelete() {
    this.expect(TT.DELETE); this.match(TT.FROM);
    const table=this.advance().val;
    let where=null;
    if(this.match(TT.WHERE)) where=this.parseExpr();
    return {type:'DELETE',table,where};
  }

  parseCreate() {
    this.advance();
    if(this.match(TT.TABLE)) {
      const ifNotExists=false;
      const name=this.advance().val;
      this.expect(TT.LPAREN);
      const cols=[], constraints=[];
      let first=true;
      while(!this.check(TT.RPAREN)) {
        if(!first) this.expect(TT.COMMA);
        first=false;
        if(this.check(TT.CONSTRAINT,TT.PRIMARY,TT.UNIQUE,TT.FOREIGN,TT.CHECK)) {
          constraints.push(this.parseTableConstraint());
        } else {
          cols.push(this.parseColDef());
        }
      }
      this.expect(TT.RPAREN);
      return {type:'CREATE_TABLE',name,cols,constraints};
    }
    if(this.match(TT.INDEX)) {
      const unique=false;
      const name=this.advance().val;
      this.expect(TT.ON);
      const table=this.advance().val;
      this.expect(TT.LPAREN);
      const cols=[];
      do { cols.push(this.advance().val); } while(this.match(TT.COMMA));
      this.expect(TT.RPAREN);
      return {type:'CREATE_INDEX',name,table,cols,unique};
    }
    if(this.match(TT.UNIQUE)) {
      this.expect(TT.INDEX);
      const name=this.advance().val;
      this.expect(TT.ON);
      const table=this.advance().val;
      this.expect(TT.LPAREN);
      const cols=[];
      do { cols.push(this.advance().val); } while(this.match(TT.COMMA));
      this.expect(TT.RPAREN);
      return {type:'CREATE_INDEX',name,table,cols,unique:true};
    }
    throw new Error('Unknown CREATE statement');
  }

  parseColDef() {
    const name=this.advance().val;
    const dataType=this.parseDataType();
    const constraints=[];
    while(!this.check(TT.COMMA,TT.RPAREN,TT.EOF)) {
      if(this.match(TT.NOT)) { this.expect(TT.NULL_KW); constraints.push({type:'NOT_NULL'}); }
      else if(this.match(TT.NULL_KW)) { constraints.push({type:'NULL'}); }
      else if(this.match(TT.UNIQUE)) { constraints.push({type:'UNIQUE'}); }
      else if(this.check(TT.PRIMARY)) { this.advance(); this.expect(TT.KEY); constraints.push({type:'PRIMARY_KEY'}); }
      else if(this.match(TT.DEFAULT)) { constraints.push({type:'DEFAULT',value:this.parseExpr()}); }
      else if(this.match(TT.CHECK)) {
        this.expect(TT.LPAREN); const expr=this.parseExpr(); this.expect(TT.RPAREN);
        constraints.push({type:'CHECK',expr});
      }
      else if(this.check(TT.REFERENCES)) {
        this.advance();
        const refTable=this.advance().val;
        let refCol=null;
        if(this.match(TT.LPAREN)){refCol=this.advance().val;this.expect(TT.RPAREN);}
        constraints.push({type:'REFERENCES',table:refTable,col:refCol});
      } else break;
    }
    return {name,dataType,constraints};
  }

  parseDataType() {
    const t=this.advance();
    let size=null;
    if(this.match(TT.LPAREN)){size=Number(this.advance().val);this.expect(TT.RPAREN);}
    return {name:t.val.toUpperCase(),size};
  }

  parseTableConstraint() {
    this.match(TT.CONSTRAINT); const name=this.check(TT.IDENT)?this.advance().val:null;
    if(this.match(TT.PRIMARY)) {
      this.expect(TT.KEY); this.expect(TT.LPAREN);
      const cols=[]; do{cols.push(this.advance().val);}while(this.match(TT.COMMA));
      this.expect(TT.RPAREN);
      return {type:'PRIMARY_KEY',name,cols};
    }
    if(this.match(TT.UNIQUE)) {
      this.expect(TT.LPAREN);
      const cols=[]; do{cols.push(this.advance().val);}while(this.match(TT.COMMA));
      this.expect(TT.RPAREN);
      return {type:'UNIQUE',name,cols};
    }
    if(this.match(TT.FOREIGN)) {
      this.expect(TT.KEY); this.expect(TT.LPAREN);
      const cols=[]; do{cols.push(this.advance().val);}while(this.match(TT.COMMA));
      this.expect(TT.RPAREN); this.expect(TT.REFERENCES);
      const refTable=this.advance().val;
      this.expect(TT.LPAREN);
      const refCols=[]; do{refCols.push(this.advance().val);}while(this.match(TT.COMMA));
      this.expect(TT.RPAREN);
      return {type:'FOREIGN_KEY',name,cols,refTable,refCols};
    }
    if(this.match(TT.CHECK)) {
      this.expect(TT.LPAREN); const expr=this.parseExpr(); this.expect(TT.RPAREN);
      return {type:'CHECK',name,expr};
    }
    throw new Error('Unknown constraint');
  }

  parseDrop() {
    this.advance();
    if(this.match(TT.TABLE)) return {type:'DROP_TABLE',name:this.advance().val};
    if(this.match(TT.INDEX)) return {type:'DROP_INDEX',name:this.advance().val};
    throw new Error('Unknown DROP');
  }

  parseAlter() {
    this.advance(); this.expect(TT.TABLE);
    const table=this.advance().val;
    if(this.match(TT.ADD)) {
      this.match(TT.COLUMN);
      const col=this.parseColDef();
      return {type:'ALTER_TABLE_ADD_COLUMN',table,col};
    }
    if(this.match(TT.DROP)) {
      this.match(TT.COLUMN);
      return {type:'ALTER_TABLE_DROP_COLUMN',table,col:this.advance().val};
    }
    if(this.match(TT.RENAME)) {
      if(this.match(TT.TO)) return {type:'ALTER_TABLE_RENAME',table,newName:this.advance().val};
      this.match(TT.COLUMN);
      const from=this.advance().val; this.match(TT.TO);
      return {type:'ALTER_TABLE_RENAME_COLUMN',table,from,to:this.advance().val};
    }
    throw new Error('Unknown ALTER TABLE');
  }

  parseExprList() {
    const list=[this.parseExpr()];
    while(this.match(TT.COMMA)) list.push(this.parseExpr());
    return list;
  }

  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left=this.parseAnd();
    while(this.match(TT.OR)) left={type:'OR',left,right:this.parseAnd()};
    return left;
  }
  parseAnd() {
    let left=this.parseNot();
    while(this.match(TT.AND)) left={type:'AND',left,right:this.parseNot()};
    return left;
  }
  parseNot() {
    if(this.match(TT.NOT)) return {type:'NOT',expr:this.parseNot()};
    return this.parseComparison();
  }
  parseComparison() {
    let left=this.parseConcat();
    const ops=[TT.EQ,TT.NEQ,TT.LT,TT.GT,TT.LTE,TT.GTE];
    while(this.check(...ops)) {
      const op=this.advance().val;
      left={type:'COMPARE',op,left,right:this.parseConcat()};
    }
    if(this.check(TT.IS)) {
      this.advance();
      const neg=!!this.match(TT.NOT);
      this.expect(TT.NULL_KW);
      return {type:'IS_NULL',neg,expr:left};
    }
    if(this.check(TT.BETWEEN)) {
      const neg=false; this.advance();
      const lo=this.parseConcat(); this.expect(TT.AND); const hi=this.parseConcat();
      return {type:'BETWEEN',neg,expr:left,lo,hi};
    }
    if(this.check(TT.NOT)) {
      if(this.peek(1).type===TT.BETWEEN){
        this.advance(); this.advance();
        const lo=this.parseConcat(); this.expect(TT.AND); const hi=this.parseConcat();
        return {type:'BETWEEN',neg:true,expr:left,lo,hi};
      }
      if(this.peek(1).type===TT.IN){
        this.advance(); this.advance();
        return {type:'IN',neg:true,expr:left,...this.parseInRHS()};
      }
      if(this.peek(1).type===TT.LIKE){
        this.advance(); this.advance();
        return {type:'LIKE',neg:true,expr:left,pattern:this.parseConcat()};
      }
    }
    if(this.match(TT.IN)) return {type:'IN',neg:false,expr:left,...this.parseInRHS()};
    if(this.match(TT.LIKE)) return {type:'LIKE',neg:false,expr:left,pattern:this.parseConcat()};
    return left;
  }
  parseInRHS() {
    this.expect(TT.LPAREN);
    if(this.check(TT.SELECT)){const q=this.parseSelect();this.expect(TT.RPAREN);return{subquery:q};}
    const values=this.parseExprList(); this.expect(TT.RPAREN);
    return{values};
  }
  parseConcat() {
    let left=this.parseAdd();
    while(this.match(TT.CONCAT)) left={type:'CONCAT',left,right:this.parseAdd()};
    return left;
  }
  parseAdd() {
    let left=this.parseMul();
    while(this.check(TT.PLUS,TT.MINUS)) {
      const op=this.advance().val;
      left={type:'ARITH',op,left,right:this.parseMul()};
    }
    return left;
  }
  parseMul() {
    let left=this.parseUnary();
    while(this.check(TT.STAR,TT.SLASH,TT.PERCENT)) {
      const op=this.advance().val;
      left={type:'ARITH',op,left,right:this.parseUnary()};
    }
    return left;
  }
  parseUnary() {
    if(this.match(TT.MINUS)) return {type:'UNARY',op:'-',expr:this.parseUnary()};
    if(this.match(TT.PLUS)) return {type:'UNARY',op:'+',expr:this.parseUnary()};
    return this.parsePostfix();
  }
  parsePostfix() { return this.parsePrimary(); }

  parsePrimary() {
    const t=this.cur();
    if(t.type===TT.NUMBER){this.advance();return{type:'LITERAL',val:t.val,dtype:'number'};}
    if(t.type===TT.STRING){this.advance();return{type:'LITERAL',val:t.val,dtype:'string'};}
    if(t.type===TT.BOOL){this.advance();return{type:'LITERAL',val:t.val,dtype:'boolean'};}
    if(t.type===TT.NULL_KW||t.type===TT.NULL_LIT){this.advance();return{type:'LITERAL',val:null,dtype:'null'};}
    if(t.type===TT.LPAREN){
      this.advance();
      if(this.check(TT.SELECT)){const q=this.parseSelect();this.expect(TT.RPAREN);return{type:'SUBQUERY',query:q};}
      const e=this.parseExpr(); this.expect(TT.RPAREN);
      return{type:'PAREN',expr:e};
    }
    if(t.type===TT.CASE){
      this.advance();
      const base=this.check(TT.WHEN)?null:this.parseExpr();
      const whens=[];
      while(this.match(TT.WHEN)){const cond=this.parseExpr();this.expect(TT.THEN);const res=this.parseExpr();whens.push({cond,res});}
      let elseExpr=null;
      if(this.match(TT.ELSE)) elseExpr=this.parseExpr();
      this.expect(TT.END);
      return{type:'CASE',base,whens,else:elseExpr};
    }
    if(t.type===TT.EXISTS){
      this.advance(); this.expect(TT.LPAREN);
      const q=this.parseSelect(); this.expect(TT.RPAREN);
      return{type:'EXISTS',query:q};
    }
    if([TT.COUNT,TT.SUM,TT.AVG,TT.MIN,TT.MAX,TT.COALESCE,TT.NULLIF,TT.CAST,
        TT.ROW_NUMBER,TT.RANK,TT.DENSE_RANK,TT.LAG,TT.LEAD,TT.FIRST_VALUE,TT.LAST_VALUE,
        TT.IDENT].includes(t.type)) {
      const name=t.val; this.advance();
      if(this.check(TT.DOT)&&!this.check(TT.LPAREN)) {
        if(this.peek(1).type!==TT.LPAREN){
          this.advance();
          const col=this.advance().val;
          return{type:'COLUMN',table:name,name:col};
        }
      }
      if(this.match(TT.LPAREN)) {
        const distinct=!!this.match(TT.DISTINCT);
        let args=[];
        if(this.check(TT.STAR)){this.advance();args=[{type:'STAR'}];}
        else if(!this.check(TT.RPAREN)){args=this.parseExprList();}
        this.expect(TT.RPAREN);
        let over=null;
        if(this.match(TT.OVER)) {
          this.expect(TT.LPAREN);
          let partition=null,orderBy=null;
          if(this.check(TT.PARTITION)){this.advance();this.expect(TT.BY);partition=this.parseExprList();}
          if(this.check(TT.ORDER)){this.advance();this.expect(TT.BY);orderBy=this.parseOrderByList();}
          this.expect(TT.RPAREN);
          over={partition,orderBy};
        }
        return{type:'CALL',name:name.toUpperCase(),distinct,args,over};
      }
      return{type:'COLUMN',table:null,name};
    }
    throw new Error(`Unexpected token in expression: ${t.type} '${t.val}' at line ${t.line}`);
  }
}

// ─── Data types ───────────────────────────────────────────────────────────────
export const DataType = {
  INTEGER:'INTEGER', FLOAT:'FLOAT', TEXT:'TEXT', BOOLEAN:'BOOLEAN',
  DATE:'DATE', TIMESTAMP:'TIMESTAMP', JSON:'JSON', BLOB:'BLOB', NULL:'NULL',
};

function coerce(val, dtype) {
  if(val===null||val===undefined) return null;
  switch((dtype||'').toUpperCase()) {
    case 'INTEGER': case 'INT': case 'BIGINT': case 'SMALLINT': return Math.trunc(Number(val));
    case 'FLOAT': case 'REAL': case 'DOUBLE': case 'NUMERIC': case 'DECIMAL': return Number(val);
    case 'TEXT': case 'VARCHAR': case 'CHAR': case 'STRING': return String(val);
    case 'BOOLEAN': case 'BOOL': return Boolean(val);
    case 'DATE': return val instanceof Date?val:new Date(val);
    case 'TIMESTAMP': return val instanceof Date?val:new Date(val);
    case 'JSON': return typeof val==='string'?JSON.parse(val):val;
    case 'BLOB': return val;
    default: return val;
  }
}

function sqlCompare(a,b) {
  if(a===null&&b===null) return 0;
  if(a===null) return -1;
  if(b===null) return 1;
  if(a instanceof Date&&b instanceof Date) return a.getTime()-b.getTime();
  if(typeof a==='string'&&typeof b==='string') return a<b?-1:a>b?1:0;
  return a<b?-1:a>b?1:0;
}

// ─── B-Tree ───────────────────────────────────────────────────────────────────
const BTREE_ORDER = 4;

class BTreeNode {
  constructor(leaf=true) {
    this.leaf=leaf; this.keys=[]; this.vals=[]; this.children=[];
  }
}

export class BTree {
  constructor(compare=sqlCompare) {
    this.root=new BTreeNode(true); this.compare=compare; this.size=0;
  }
  search(key) {
    return this._search(this.root,key);
  }
  _search(node,key) {
    let i=0;
    while(i<node.keys.length&&this.compare(key,node.keys[i])>0) i++;
    if(i<node.keys.length&&this.compare(key,node.keys[i])===0) return node.vals[i];
    if(node.leaf) return undefined;
    return this._search(node.children[i],key);
  }
  insert(key,val) {
    if(this._update(this.root,key,val)) return;
    this.size++;
    const root=this.root;
    if(root.keys.length===2*BTREE_ORDER-1) {
      const newRoot=new BTreeNode(false);
      newRoot.children.push(root);
      this._splitChild(newRoot,0);
      this.root=newRoot;
      this._insertNonFull(newRoot,key,val);
    } else this._insertNonFull(root,key,val);
  }
  _update(node,key,val) {
    let i=0;
    while(i<node.keys.length&&this.compare(key,node.keys[i])>0) i++;
    if(i<node.keys.length&&this.compare(key,node.keys[i])===0) {
      if(!Array.isArray(node.vals[i])) node.vals[i]=[node.vals[i]];
      node.vals[i].push(val); return true;
    }
    if(node.leaf) return false;
    return this._update(node.children[i],key,val);
  }
  _insertNonFull(node,key,val) {
    let i=node.keys.length-1;
    if(node.leaf) {
      node.keys.push(null); node.vals.push(null);
      while(i>=0&&this.compare(key,node.keys[i])<0) {
        node.keys[i+1]=node.keys[i]; node.vals[i+1]=node.vals[i]; i--;
      }
      node.keys[i+1]=key; node.vals[i+1]=[val];
    } else {
      while(i>=0&&this.compare(key,node.keys[i])<0) i--;
      i++;
      if(node.children[i].keys.length===2*BTREE_ORDER-1) {
        this._splitChild(node,i);
        if(this.compare(key,node.keys[i])>0) i++;
      }
      this._insertNonFull(node.children[i],key,val);
    }
  }
  _splitChild(parent,i) {
    const t=BTREE_ORDER;
    const child=parent.children[i];
    const sibling=new BTreeNode(child.leaf);
    parent.keys.splice(i,0,child.keys[t-1]);
    parent.vals.splice(i,0,child.vals[t-1]);
    parent.children.splice(i+1,0,sibling);
    sibling.keys=child.keys.splice(t);
    sibling.vals=child.vals.splice(t);
    child.keys.pop(); child.vals.pop();
    if(!child.leaf) sibling.children=child.children.splice(t);
  }
  range(lo,hi) {
    const results=[];
    this._range(this.root,lo,hi,results);
    return results.flat();
  }
  _range(node,lo,hi,acc) {
    for(let i=0;i<node.keys.length;i++) {
      if(!node.leaf) this._range(node.children[i],lo,hi,acc);
      const k=node.keys[i];
      const loOk=lo===undefined||this.compare(k,lo)>=0;
      const hiOk=hi===undefined||this.compare(k,hi)<=0;
      if(loOk&&hiOk) acc.push(...node.vals[i]);
    }
    if(!node.leaf) this._range(node.children[node.keys.length],lo,hi,acc);
  }
  delete(key,rowId) {
    this._delete(this.root,key,rowId);
  }
  _delete(node,key,rowId) {
    let i=0;
    while(i<node.keys.length&&this.compare(key,node.keys[i])>0) i++;
    if(i<node.keys.length&&this.compare(key,node.keys[i])===0) {
      if(Array.isArray(node.vals[i])) {
        node.vals[i]=node.vals[i].filter(v=>v!==rowId);
        if(node.vals[i].length===0) {
          node.keys.splice(i,1); node.vals.splice(i,1); this.size--;
        }
      }
      return;
    }
    if(!node.leaf) this._delete(node.children[i],key,rowId);
  }
  toArray() {
    const out=[];
    this._toArray(this.root,out);
    return out;
  }
  _toArray(node,acc) {
    for(let i=0;i<node.keys.length;i++){
      if(!node.leaf) this._toArray(node.children[i],acc);
      if(Array.isArray(node.vals[i])) acc.push(...node.vals[i]);
    }
    if(!node.leaf) this._toArray(node.children[node.keys.length],acc);
  }
}

// ─── Hash Index ───────────────────────────────────────────────────────────────
export class HashIndex {
  constructor() { this.map=new Map(); }
  insert(key,rowId) {
    const k=String(key);
    if(!this.map.has(k)) this.map.set(k,[]);
    this.map.get(k).push(rowId);
  }
  lookup(key) { return this.map.get(String(key))||[]; }
  delete(key,rowId) {
    const k=String(key);
    const arr=this.map.get(k);
    if(arr){const i=arr.indexOf(rowId);if(i>=0)arr.splice(i,1);if(arr.length===0)this.map.delete(k);}
  }
  clear() { this.map.clear(); }
}

// ─── Full-text index ──────────────────────────────────────────────────────────
export class FullTextIndex {
  constructor() { this.invertedIndex=new Map(); this.docFreq=new Map(); this.docCount=0; }
  tokenize(text) {
    return String(text||'').toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(Boolean);
  }
  index(rowId,text) {
    this.docCount++;
    const terms=this.tokenize(text);
    const freq=new Map();
    for(const t of terms) freq.set(t,(freq.get(t)||0)+1);
    for(const [term,count] of freq) {
      if(!this.invertedIndex.has(term)) this.invertedIndex.set(term,new Map());
      this.invertedIndex.get(term).set(rowId,{tf:count/terms.length,rowId});
      this.docFreq.set(term,(this.docFreq.get(term)||0)+1);
    }
  }
  remove(rowId,text) {
    const terms=this.tokenize(text);
    for(const term of new Set(terms)) {
      const map=this.invertedIndex.get(term);
      if(map){map.delete(rowId);if(map.size===0)this.invertedIndex.delete(term);}
      const df=this.docFreq.get(term);
      if(df){if(df<=1)this.docFreq.delete(term);else this.docFreq.set(term,df-1);}
    }
    this.docCount--;
  }
  search(query) {
    const terms=this.tokenize(query);
    const scores=new Map();
    for(const term of terms) {
      const docs=this.invertedIndex.get(term);
      if(!docs) continue;
      const idf=Math.log((this.docCount+1)/(docs.size+1))+1;
      for(const [rowId,{tf}] of docs) scores.set(rowId,(scores.get(rowId)||0)+tf*idf);
    }
    return [...scores.entries()].sort((a,b)=>b[1]-a[1]).map(([rowId,score])=>({rowId,score}));
  }
}

// ─── Table ────────────────────────────────────────────────────────────────────
export class Table {
  constructor(name,cols,constraints=[]) {
    this.name=name; this.cols=cols; this.constraints=constraints;
    this.rows=new Map(); this.nextId=1;
    this.indexes=new Map(); this.hashIndexes=new Map();
    this.triggers={before:{INSERT:[],UPDATE:[],DELETE:[]},after:{INSERT:[],UPDATE:[],DELETE:[]}};
    this._buildColMap();
    this._processPrimaryKey();
  }
  _buildColMap() { this.colMap=new Map(this.cols.map((c,i)=>[c.name,i])); }
  _processPrimaryKey() {
    this.primaryKey=null;
    for(const c of this.cols) {
      if(c.constraints&&c.constraints.some(x=>x.type==='PRIMARY_KEY')) {
        this.primaryKey=c.name; break;
      }
    }
    for(const c of this.constraints||[]) {
      if(c.type==='PRIMARY_KEY') { this.primaryKey=c.cols[0]; break; }
    }
  }
  insert(row) {
    const id=this.nextId++;
    const full=this._applyDefaults(row);
    this._validate(full);
    this.rows.set(id,{...full});
    this._indexInsert(id,full);
    return id;
  }
  _applyDefaults(row) {
    const out={};
    for(const col of this.cols) {
      let val=row[col.name];
      if((val===undefined||val===null)&&col.constraints) {
        const def=col.constraints.find(c=>c.type==='DEFAULT');
        if(def) val=typeof def.value==='object'&&def.value.type==='LITERAL'?def.value.val:def.value;
      }
      out[col.name]=coerce(val,col.dataType?.name);
    }
    return out;
  }
  _validate(row) {
    for(const col of this.cols) {
      const val=row[col.name];
      if(!col.constraints) continue;
      if(col.constraints.some(c=>c.type==='NOT_NULL')&&(val===null||val===undefined)) {
        throw new Error(`NOT NULL violation on column '${col.name}'`);
      }
    }
  }
  update(id,changes) {
    const row=this.rows.get(id);
    if(!row) return false;
    this._indexDelete(id,row);
    const updated={...row,...changes};
    this._validate(updated);
    this.rows.set(id,updated);
    this._indexInsert(id,updated);
    return true;
  }
  delete(id) {
    const row=this.rows.get(id);
    if(!row) return false;
    this._indexDelete(id,row);
    this.rows.delete(id);
    return true;
  }
  _indexInsert(id,row) {
    for(const [colName,idx] of this.indexes) idx.insert(row[colName],id);
    for(const [colName,idx] of this.hashIndexes) idx.insert(row[colName],id);
  }
  _indexDelete(id,row) {
    for(const [colName,idx] of this.indexes) idx.delete(row[colName],id);
    for(const [colName,idx] of this.hashIndexes) idx.delete(row[colName],id);
  }
  createBTreeIndex(col) { this.indexes.set(col,new BTree()); }
  createHashIndex(col) { this.hashIndexes.set(col,new HashIndex()); }
  addTrigger(timing,event,fn) { this.triggers[timing][event].push(fn); }
  scan(predicate=null) {
    const results=[];
    for(const [id,row] of this.rows) {
      if(!predicate||predicate(row,id)) results.push({...row,_rowId:id});
    }
    return results;
  }
  getById(id) { const r=this.rows.get(id); return r?{...r,_rowId:id}:null; }
  truncate() { this.rows.clear(); for(const idx of this.indexes.values()) {} this.nextId=1; }
  clone() {
    const t=new Table(this.name,[...this.cols],[...this.constraints]);
    t.rows=new Map([...this.rows].map(([k,v])=>[k,{...v}]));
    t.nextId=this.nextId;
    return t;
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────
export class Evaluator {
  constructor(db) { this.db=db; }

  eval(node,row,env={}) {
    if(!node) return null;
    switch(node.type) {
      case 'LITERAL': return node.val;
      case 'COLUMN': {
        const name=node.name==='*'?'*':node.name;
        if(node.table) {
          const alias=node.table;
          const prefixed=`${alias}.${name}`;
          if(row[prefixed]!==undefined) return row[prefixed];
          for(const k of Object.keys(row)) if(k.split('.').pop()===name) return row[k];
        }
        if(row[name]!==undefined) return row[name];
        for(const k of Object.keys(row)) if(k.split('.').pop()===name) return row[k];
        return null;
      }
      case 'STAR': return '*';
      case 'PAREN': return this.eval(node.expr,row,env);
      case 'UNARY': {
        const v=this.eval(node.expr,row,env);
        return node.op==='-'?-v:+v;
      }
      case 'ARITH': {
        const l=this.eval(node.left,row,env), r=this.eval(node.right,row,env);
        if(l===null||r===null) return null;
        if(node.op==='+') return l+r;
        if(node.op==='-') return l-r;
        if(node.op==='*') return l*r;
        if(node.op==='/') return r===0?null:l/r;
        if(node.op==='%') return l%r;
        return null;
      }
      case 'CONCAT': {
        const l=this.eval(node.left,row,env), r=this.eval(node.right,row,env);
        return String(l??'')+String(r??'');
      }
      case 'COMPARE': {
        const l=this.eval(node.left,row,env), r=this.eval(node.right,row,env);
        const cmp=sqlCompare(l,r);
        if(node.op==='='||node.op==='==') return cmp===0;
        if(node.op==='!='||node.op==='<>') return cmp!==0;
        if(node.op==='<') return cmp<0;
        if(node.op==='>') return cmp>0;
        if(node.op==='<=') return cmp<=0;
        if(node.op==='>=') return cmp>=0;
        return false;
      }
      case 'AND': return this.eval(node.left,row,env)&&this.eval(node.right,row,env);
      case 'OR': return this.eval(node.left,row,env)||this.eval(node.right,row,env);
      case 'NOT': return !this.eval(node.expr,row,env);
      case 'IS_NULL': {
        const v=this.eval(node.expr,row,env);
        return node.neg?(v!==null&&v!==undefined):(v===null||v===undefined);
      }
      case 'BETWEEN': {
        const v=this.eval(node.expr,row,env);
        const lo=this.eval(node.lo,row,env), hi=this.eval(node.hi,row,env);
        const res=sqlCompare(v,lo)>=0&&sqlCompare(v,hi)<=0;
        return node.neg?!res:res;
      }
      case 'IN': {
        const v=this.eval(node.expr,row,env);
        let res=false;
        if(node.values) res=node.values.some(e=>sqlCompare(v,this.eval(e,row,env))===0);
        else if(node.subquery) {
          const rows=this._execSelect(node.subquery,env);
          res=rows.some(r=>sqlCompare(v,Object.values(r)[0])===0);
        }
        return node.neg?!res:res;
      }
      case 'LIKE': {
        const v=String(this.eval(node.expr,row,env)??'');
        const p=String(this.eval(node.pattern,row,env)??'');
        const re=new RegExp('^'+p.replace(/%/g,'.*').replace(/_/g,'.')+'$','i');
        const res=re.test(v);
        return node.neg?!res:res;
      }
      case 'EXISTS': {
        const rows=this._execSelect(node.query,env);
        return rows.length>0;
      }
      case 'SUBQUERY': {
        const rows=this._execSelect(node.query,env);
        return rows.length>0?Object.values(rows[0])[0]:null;
      }
      case 'CASE': {
        if(node.base) {
          const baseVal=this.eval(node.base,row,env);
          for(const w of node.whens) {
            if(sqlCompare(baseVal,this.eval(w.cond,row,env))===0) return this.eval(w.res,row,env);
          }
        } else {
          for(const w of node.whens) {
            if(this.eval(w.cond,row,env)) return this.eval(w.res,row,env);
          }
        }
        return this.eval(node.else,row,env);
      }
      case 'CALL': return this.evalCall(node,row,env);
      default: return null;
    }
  }

  evalCall(node,row,env) {
    const fn=node.name.toUpperCase();
    const arg0=node.args[0];
    switch(fn) {
      case 'COALESCE': {
        for(const a of node.args){const v=this.eval(a,row,env);if(v!==null&&v!==undefined)return v;}
        return null;
      }
      case 'NULLIF': {
        const a=this.eval(node.args[0],row,env), b=this.eval(node.args[1],row,env);
        return sqlCompare(a,b)===0?null:a;
      }
      case 'CAST': {
        const val=this.eval(node.args[0],row,env);
        const dtype=node.args[1]?.name||'TEXT';
        return coerce(val,dtype);
      }
      case 'UPPER': return String(this.eval(arg0,row,env)||'').toUpperCase();
      case 'LOWER': return String(this.eval(arg0,row,env)||'').toLowerCase();
      case 'LENGTH': return String(this.eval(arg0,row,env)||'').length;
      case 'TRIM': return String(this.eval(arg0,row,env)||'').trim();
      case 'SUBSTR': case 'SUBSTRING': {
        const s=String(this.eval(node.args[0],row,env)||'');
        const start=Number(this.eval(node.args[1],row,env)||0)-1;
        const len=node.args[2]?Number(this.eval(node.args[2],row,env)):undefined;
        return len!==undefined?s.substr(start,len):s.substr(start);
      }
      case 'REPLACE': {
        const s=String(this.eval(node.args[0],row,env)||'');
        const f=String(this.eval(node.args[1],row,env)||'');
        const r=String(this.eval(node.args[2],row,env)||'');
        return s.split(f).join(r);
      }
      case 'ABS': { const v=this.eval(arg0,row,env); return v===null?null:Math.abs(v); }
      case 'ROUND': {
        const v=this.eval(node.args[0],row,env);
        const d=node.args[1]?Number(this.eval(node.args[1],row,env)):0;
        return v===null?null:Number(v.toFixed(d));
      }
      case 'FLOOR': return Math.floor(this.eval(arg0,row,env));
      case 'CEIL': case 'CEILING': return Math.ceil(this.eval(arg0,row,env));
      case 'MOD': {
        const a=this.eval(node.args[0],row,env), b=this.eval(node.args[1],row,env);
        return a%b;
      }
      case 'NOW': case 'CURRENT_TIMESTAMP': return new Date();
      case 'DATE': return new Date(this.eval(arg0,row,env));
      case 'YEAR': { const d=new Date(this.eval(arg0,row,env)); return d.getFullYear(); }
      case 'MONTH': { const d=new Date(this.eval(arg0,row,env)); return d.getMonth()+1; }
      case 'DAY': { const d=new Date(this.eval(arg0,row,env)); return d.getDate(); }
      case 'JSON_EXTRACT': {
        const obj=this.eval(node.args[0],row,env);
        const path=String(this.eval(node.args[1],row,env)||'');
        return this._jsonPath(obj,path);
      }
      default: return null;
    }
  }

  _jsonPath(obj,path) {
    const parts=path.replace(/^\$\./,'').split('.');
    let cur=typeof obj==='string'?JSON.parse(obj):obj;
    for(const p of parts) {
      if(cur===null||cur===undefined) return null;
      cur=cur[p];
    }
    return cur??null;
  }

  _execSelect(query,env) {
    return new QueryExecutor(this.db).execute(query);
  }
}

// ─── Aggregation ──────────────────────────────────────────────────────────────
function aggregate(rows,agg,ev) {
  const vals=rows.map(r=>{
    if(agg.args[0]&&agg.args[0].type==='STAR') return 1;
    return ev.eval(agg.args[0],r);
  }).filter(v=>v!==null&&v!==undefined);

  switch(agg.name) {
    case 'COUNT': return agg.args[0]?.type==='STAR'?rows.length:vals.length;
    case 'SUM': return vals.reduce((a,b)=>a+Number(b),0);
    case 'AVG': return vals.length?vals.reduce((a,b)=>a+Number(b),0)/vals.length:null;
    case 'MIN': return vals.length?vals.reduce((a,b)=>sqlCompare(a,b)<0?a:b):null;
    case 'MAX': return vals.length?vals.reduce((a,b)=>sqlCompare(a,b)>0?a:b):null;
    case 'STDDEV': {
      if(!vals.length) return null;
      const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
      return Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    }
    case 'VARIANCE': {
      if(!vals.length) return null;
      const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
      return vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length;
    }
    default: return null;
  }
}

function isAggCall(node) {
  if(!node||node.type!=='CALL') return false;
  return ['COUNT','SUM','AVG','MIN','MAX','STDDEV','VARIANCE'].includes(node.name.toUpperCase());
}

function collectAggs(expr,out=[]) {
  if(!expr) return out;
  if(isAggCall(expr)) { out.push(expr); return out; }
  if(expr.left) collectAggs(expr.left,out);
  if(expr.right) collectAggs(expr.right,out);
  if(expr.expr) collectAggs(expr.expr,out);
  if(expr.args) expr.args.forEach(a=>collectAggs(a,out));
  if(expr.whens) expr.whens.forEach(w=>{collectAggs(w.cond,out);collectAggs(w.res,out);});
  if(expr.else) collectAggs(expr.else,out);
  return out;
}

// ─── Window functions ─────────────────────────────────────────────────────────
function applyWindowFunctions(rows,columns,ev) {
  const winCols=columns.filter(c=>c.expr&&c.expr.type==='CALL'&&c.expr.over);
  if(!winCols.length) return rows;
  const result=rows.map(r=>({...r}));
  for(const col of winCols) {
    const fn=col.expr.name.toUpperCase();
    const over=col.expr.over;
    // partition rows
    const getPartKey=row=>{
      if(!over.partition) return '__ALL__';
      return over.partition.map(e=>ev.eval(e,row)).join('|');
    };
    const partitions=new Map();
    for(let i=0;i<rows.length;i++) {
      const k=getPartKey(rows[i]);
      if(!partitions.has(k)) partitions.set(k,[]);
      partitions.get(k).push(i);
    }
    for(const [,idxs] of partitions) {
      let sortedIdxs=[...idxs];
      if(over.orderBy) {
        sortedIdxs.sort((a,b)=>{
          for(const ob of over.orderBy) {
            const av=ev.eval(ob.expr,rows[a]),bv=ev.eval(ob.expr,rows[b]);
            const c=sqlCompare(av,bv);
            if(c!==0) return ob.dir==='DESC'?-c:c;
          }
          return 0;
        });
      }
      const partRows=sortedIdxs.map(i=>rows[i]);
      for(let pi=0;pi<sortedIdxs.length;pi++) {
        const rowIdx=sortedIdxs[pi];
        let val=null;
        if(fn==='ROW_NUMBER') val=pi+1;
        else if(fn==='RANK') {
          val=1;
          if(pi>0&&over.orderBy) {
            let tied=true;
            for(const ob of over.orderBy) {
              if(sqlCompare(ev.eval(ob.expr,partRows[pi]),ev.eval(ob.expr,partRows[pi-1]))!==0){tied=false;break;}
            }
            if(!tied) val=pi+1;
            else val=result[sortedIdxs[pi-1]][col.alias||col.expr.name]||pi+1;
          }
        }
        else if(fn==='DENSE_RANK') {
          val=1;
          for(let j=0;j<pi;j++) {
            let different=false;
            for(const ob of over.orderBy||[]) {
              if(sqlCompare(ev.eval(ob.expr,partRows[j]),ev.eval(ob.expr,partRows[j+1]))!==0){different=true;break;}
            }
            if(different) val++;
          }
        }
        else if(fn==='LAG') {
          const offset=col.expr.args[1]?Number(ev.eval(col.expr.args[1],partRows[pi])):1;
          val=pi-offset>=0?ev.eval(col.expr.args[0],partRows[pi-offset]):null;
        }
        else if(fn==='LEAD') {
          const offset=col.expr.args[1]?Number(ev.eval(col.expr.args[1],partRows[pi])):1;
          val=pi+offset<partRows.length?ev.eval(col.expr.args[0],partRows[pi+offset]):null;
        }
        else if(fn==='FIRST_VALUE') val=ev.eval(col.expr.args[0],partRows[0]);
        else if(fn==='LAST_VALUE') val=ev.eval(col.expr.args[0],partRows[partRows.length-1]);
        else if(isAggCall(col.expr)) val=aggregate(partRows,col.expr,ev);
        const outKey=col.alias||fn;
        result[rowIdx][outKey]=val;
      }
    }
  }
  return result;
}

// ─── Join executor ────────────────────────────────────────────────────────────
function prefixRow(row,alias) {
  const out={};
  for(const [k,v] of Object.entries(row)) {
    out[alias?`${alias}.${k}`:k]=v;
    out[k]=v;
  }
  return out;
}

function nestedLoopJoin(left,right,cond,kind,ev) {
  const results=[];
  const matched=new Set();
  for(const lr of left) {
    let rowMatched=false;
    for(let ri=0;ri<right.length;ri++) {
      const combined={...lr,...right[ri]};
      const ok=!cond||ev.eval(cond,combined);
      if(ok) { results.push(combined); rowMatched=true; matched.add(ri); }
    }
    if(!rowMatched&&(kind==='LEFT'||kind==='FULL')) {
      const nullRight=Object.fromEntries(Object.keys(right[0]||{}).map(k=>[k,null]));
      results.push({...lr,...nullRight});
    }
  }
  if(kind==='RIGHT'||kind==='FULL') {
    for(let ri=0;ri<right.length;ri++) {
      if(!matched.has(ri)) {
        const nullLeft=Object.fromEntries(Object.keys(left[0]||{}).map(k=>[k,null]));
        results.push({...nullLeft,...right[ri]});
      }
    }
  }
  return results;
}

// ─── Query Executor ───────────────────────────────────────────────────────────
export class QueryExecutor {
  constructor(db) { this.db=db; this.ev=new Evaluator(db); }

  execute(node) {
    if(!node) return [];
    switch(node.type) {
      case 'SELECT': return this.execSelect(node);
      case 'UNION': {
        const left=this.execute(node.left);
        const right=this.execute(node.right);
        if(node.all) return [...left,...right];
        const seen=new Set();
        return [...left,...right].filter(r=>{
          const k=JSON.stringify(r);
          if(seen.has(k)) return false;
          seen.add(k); return true;
        });
      }
      default: return [];
    }
  }

  execSelect(node) {
    // CTEs
    if(node.ctes) {
      for(const cte of node.ctes) {
        const rows=this.execute(cte.query);
        const t=new Table(cte.name,rows[0]?Object.keys(rows[0]).map(n=>({name:n,dataType:{name:'TEXT'}})):[]);
        for(const r of rows) t.insert(r);
        this.db._ctes=this.db._ctes||new Map();
        this.db._ctes.set(cte.name,t);
      }
    }
    // FROM
    let rows=[];
    if(node.from) rows=this._resolveFrom(node.from);
    else rows=[{}];

    // JOINs
    for(const join of node.joins||[]) {
      const rightRows=this._resolveFrom(join.table);
      if(join.kind==='CROSS') {
        rows=rows.flatMap(l=>rightRows.map(r=>({...l,...r})));
      } else {
        rows=nestedLoopJoin(rows,rightRows,join.cond,join.kind,this.ev);
      }
    }
    // WHERE
    if(node.where) rows=rows.filter(r=>this.ev.eval(node.where,r));

    // GROUP BY / aggregate
    const allCols=node.columns||[];
    const aggExprs=allCols.flatMap(c=>c.expr?collectAggs(c.expr):[]);
    const hasAgg=aggExprs.length>0||(node.groupBy&&node.groupBy.length>0);

    if(hasAgg) {
      const groupKeys=node.groupBy||[];
      const groups=new Map();
      for(const row of rows) {
        const key=groupKeys.map(e=>JSON.stringify(this.ev.eval(e,row))).join('|')||'__all__';
        if(!groups.has(key)) groups.set(key,{key,rows:[],repr:row});
        groups.get(key).rows.push(row);
      }
      rows=[];
      for(const {rows:gRows,repr} of groups.values()) {
        const r={...repr};
        for(const agg of aggExprs) {
          const k=agg.alias||agg.name;
          r[k]=aggregate(gRows,agg,this.ev);
        }
        r.__group_rows=gRows;
        rows.push(r);
      }
      if(node.having) rows=rows.filter(r=>this.ev.eval(node.having,r));
    }

    // Window functions
    rows=applyWindowFunctions(rows,allCols,this.ev);

    // ORDER BY
    if(node.orderBy) {
      rows.sort((a,b)=>{
        for(const ob of node.orderBy) {
          const av=this.ev.eval(ob.expr,a), bv=this.ev.eval(ob.expr,b);
          const c=sqlCompare(av,bv);
          if(c!==0) return ob.dir==='DESC'?-c:c;
        }
        return 0;
      });
    }

    // LIMIT/OFFSET
    const off=node.offset?Number(this.ev.eval(node.offset,{})):0;
    if(off) rows=rows.slice(off);
    if(node.limit!=null) {
      const lim=Number(this.ev.eval(node.limit,{}));
      rows=rows.slice(0,lim);
    }

    // Project columns
    return rows.map(row=>this._project(node.columns,row,hasAgg));
  }

  _resolveFrom(ref) {
    if(ref.type==='SUBQUERY') {
      const rows=this.execute(ref.query);
      const alias=ref.alias;
      return rows.map(r=>prefixRow(r,alias));
    }
    const name=ref.name;
    let table=this.db.getTable(name);
    if(!table&&this.db._ctes) table=this.db._ctes.get(name);
    if(!table) throw new Error(`Table '${name}' not found`);
    const alias=ref.alias||name;
    return table.scan().map(r=>prefixRow(r,alias));
  }

  _project(columns,row,hasAgg) {
    const out={};
    for(const col of columns) {
      if(col.type==='STAR') { Object.assign(out,Object.fromEntries(Object.entries(row).filter(([k])=>!k.includes('.')))); continue; }
      const expr=col.expr;
      let key=col.alias;
      if(!key) {
        if(expr.type==='COLUMN') key=expr.name;
        else if(expr.type==='CALL') key=expr.name.toLowerCase();
        else key=`col_${Object.keys(out).length}`;
      }
      if(hasAgg&&isAggCall(expr)) {
        const k2=expr.alias||expr.name;
        out[key]=row[k2]??this.ev.eval(expr,row);
      } else {
        out[key]=this.ev.eval(expr,row);
      }
    }
    return out;
  }
}

// ─── Transaction Manager ──────────────────────────────────────────────────────
export class TransactionManager {
  constructor(db) { this.db=db; this.txStack=[]; this.savepoints=new Map(); }
  begin() {
    const snapshot=new Map([...this.db.tables].map(([k,v])=>[k,v.clone()]));
    this.txStack.push(snapshot);
  }
  commit() { if(this.txStack.length) this.txStack.pop(); }
  rollback() {
    if(!this.txStack.length) return;
    const snapshot=this.txStack.pop();
    for(const [k,v] of snapshot) this.db.tables.set(k,v);
  }
  savepoint(name) {
    const snapshot=new Map([...this.db.tables].map(([k,v])=>[k,v.clone()]));
    this.savepoints.set(name,snapshot);
  }
  releaseSavepoint(name) { this.savepoints.delete(name); }
  rollbackToSavepoint(name) {
    const snap=this.savepoints.get(name);
    if(!snap) throw new Error(`Savepoint '${name}' not found`);
    for(const [k,v] of snap) this.db.tables.set(k,v);
  }
  get active() { return this.txStack.length>0; }
}

// ─── Database ─────────────────────────────────────────────────────────────────
export class Database {
  constructor(name='db') {
    this.name=name;
    this.tables=new Map();
    this.indexes=new Map();
    this.tx=new TransactionManager(this);
    this._ctes=new Map();
    this._queryLog=[];
    this._stats={queries:0,inserts:0,updates:0,deletes:0};
  }

  exec(sql) {
    this._stats.queries++;
    const tokens=new Lexer(sql).tokenize();
    const stmts=new Parser(tokens).parse();
    const results=[];
    for(const stmt of stmts) results.push(this._execStmt(stmt));
    this._ctes.clear();
    return results;
  }

  query(sql) {
    const results=this.exec(sql);
    return results[results.length-1];
  }

  _execStmt(stmt) {
    switch(stmt.type) {
      case 'SELECT': case 'UNION': case 'WITH':
        return new QueryExecutor(this).execute(stmt);
      case 'INSERT': return this._insert(stmt);
      case 'INSERT_SELECT': return this._insertSelect(stmt);
      case 'UPDATE': return this._update(stmt);
      case 'DELETE': return this._delete(stmt);
      case 'CREATE_TABLE': return this._createTable(stmt);
      case 'DROP_TABLE': return this._dropTable(stmt);
      case 'CREATE_INDEX': return this._createIndex(stmt);
      case 'DROP_INDEX': return this._dropIndex(stmt);
      case 'ALTER_TABLE_ADD_COLUMN': return this._alterAddCol(stmt);
      case 'ALTER_TABLE_DROP_COLUMN': return this._alterDropCol(stmt);
      case 'ALTER_TABLE_RENAME': return this._alterRename(stmt);
      case 'TRUNCATE': return this._truncate(stmt);
      case 'BEGIN': this.tx.begin(); return {action:'BEGIN'};
      case 'COMMIT': this.tx.commit(); return {action:'COMMIT'};
      case 'ROLLBACK': this.tx.rollback(); return {action:'ROLLBACK'};
      case 'SAVEPOINT': this.tx.savepoint(stmt.name); return {action:'SAVEPOINT',name:stmt.name};
      case 'RELEASE_SAVEPOINT': this.tx.releaseSavepoint(stmt.name); return {action:'RELEASE_SAVEPOINT'};
      case 'EXPLAIN': return this._explain(stmt.stmt);
      default: throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  _insert(stmt) {
    this._stats.inserts++;
    const table=this.getTable(stmt.table);
    const ev=new Evaluator(this);
    let inserted=0;
    for(const vals of stmt.rows) {
      const row={};
      if(stmt.cols) {
        stmt.cols.forEach((col,i)=>row[col]=ev.eval(vals[i],{}));
      } else {
        table.cols.forEach((col,i)=>row[col.name]=ev.eval(vals[i]??{type:'LITERAL',val:null},{}));
      }
      table.insert(row);
      inserted++;
    }
    return {rowsAffected:inserted};
  }

  _insertSelect(stmt) {
    const table=this.getTable(stmt.table);
    const rows=new QueryExecutor(this).execute(stmt.select);
    for(const r of rows) {
      const row={};
      if(stmt.cols) stmt.cols.forEach((col,i)=>row[col]=Object.values(r)[i]);
      else Object.assign(row,r);
      table.insert(row);
    }
    return {rowsAffected:rows.length};
  }

  _update(stmt) {
    this._stats.updates++;
    const table=this.getTable(stmt.table);
    const ev=new Evaluator(this);
    let affected=0;
    for(const [id,row] of table.rows) {
      if(stmt.where&&!ev.eval(stmt.where,{...row,_rowId:id})) continue;
      const changes={};
      for(const s of stmt.sets) changes[s.col]=ev.eval(s.val,row);
      table.update(id,changes);
      affected++;
    }
    return {rowsAffected:affected};
  }

  _delete(stmt) {
    this._stats.deletes++;
    const table=this.getTable(stmt.table);
    const ev=new Evaluator(this);
    const toDelete=[];
    for(const [id,row] of table.rows) {
      if(!stmt.where||ev.eval(stmt.where,{...row,_rowId:id})) toDelete.push(id);
    }
    toDelete.forEach(id=>table.delete(id));
    return {rowsAffected:toDelete.length};
  }

  _createTable(stmt) {
    if(this.tables.has(stmt.name)) throw new Error(`Table '${stmt.name}' already exists`);
    const table=new Table(stmt.name,stmt.cols,stmt.constraints);
    this.tables.set(stmt.name,table);
    return {action:'CREATE_TABLE',name:stmt.name};
  }

  _dropTable(stmt) {
    if(!this.tables.has(stmt.name)) throw new Error(`Table '${stmt.name}' does not exist`);
    this.tables.delete(stmt.name);
    return {action:'DROP_TABLE',name:stmt.name};
  }

  _createIndex(stmt) {
    const table=this.getTable(stmt.table);
    for(const col of stmt.cols) {
      if(stmt.unique) table.createHashIndex(col);
      else table.createBTreeIndex(col);
    }
    this.indexes.set(stmt.name,{table:stmt.table,cols:stmt.cols,unique:stmt.unique});
    return {action:'CREATE_INDEX',name:stmt.name};
  }

  _dropIndex(stmt) {
    const info=this.indexes.get(stmt.name);
    if(!info) throw new Error(`Index '${stmt.name}' not found`);
    const table=this.getTable(info.table);
    for(const col of info.cols) { table.indexes.delete(col); table.hashIndexes.delete(col); }
    this.indexes.delete(stmt.name);
    return {action:'DROP_INDEX',name:stmt.name};
  }

  _alterAddCol(stmt) {
    const table=this.getTable(stmt.table);
    table.cols.push(stmt.col);
    table._buildColMap();
    for(const [,row] of table.rows) row[stmt.col.name]=null;
    return {action:'ALTER_ADD_COLUMN'};
  }

  _alterDropCol(stmt) {
    const table=this.getTable(stmt.table);
    table.cols=table.cols.filter(c=>c.name!==stmt.col);
    table._buildColMap();
    for(const [,row] of table.rows) delete row[stmt.col];
    return {action:'ALTER_DROP_COLUMN'};
  }

  _alterRename(stmt) {
    const table=this.getTable(stmt.table);
    table.name=stmt.newName;
    this.tables.set(stmt.newName,table);
    this.tables.delete(stmt.table);
    return {action:'ALTER_RENAME'};
  }

  _truncate(stmt) {
    const table=this.getTable(stmt.table);
    table.truncate();
    return {action:'TRUNCATE',table:stmt.table};
  }

  _explain(stmt) {
    return {action:'EXPLAIN',plan:`Seq Scan on ${stmt.table||'(derived)'}`,stmt};
  }

  getTable(name) {
    const t=this.tables.get(name)||(this._ctes&&this._ctes.get(name));
    if(!t) throw new Error(`Table '${name}' not found`);
    return t;
  }

  createTable(name,cols,constraints=[]) {
    const table=new Table(name,cols,constraints);
    this.tables.set(name,table);
    return table;
  }

  stats() { return {...this._stats}; }
  tableNames() { return [...this.tables.keys()]; }
  describe(name) { const t=this.getTable(name); return t.cols.map(c=>({name:c.name,type:c.dataType?.name||'TEXT'})); }
}

// ─── Connection Pool ──────────────────────────────────────────────────────────
export class ConnectionPool {
  constructor(db,maxConn=10) { this.db=db; this.maxConn=maxConn; this.active=0; this.queue=[]; }
  acquire() {
    return new Promise((resolve,reject)=>{
      if(this.active<this.maxConn) { this.active++; resolve(this._makeConn()); }
      else if(this.queue.length<100) this.queue.push({resolve,reject});
      else reject(new Error('Connection pool exhausted'));
    });
  }
  _makeConn() {
    return {
      query:(sql)=>this.db.query(sql),
      exec:(sql)=>this.db.exec(sql),
      release:()=>{ this.active--; if(this.queue.length){const {resolve}=this.queue.shift();this.active++;resolve(this._makeConn());} },
    };
  }
}

// ─── Schema Builder ───────────────────────────────────────────────────────────
export class SchemaBuilder {
  constructor(db) { this.db=db; }
  table(name) { return new TableBuilder(name,this.db); }
  dropTable(name) { this.db.exec(`DROP TABLE ${name}`); return this; }
  hasTable(name) { return this.db.tables.has(name); }
  tableNames() { return this.db.tableNames(); }
}

export class TableBuilder {
  constructor(name,db) { this.name=name; this.db=db; this._cols=[]; this._constraints=[]; }
  integer(name) { return this._col(name,'INTEGER'); }
  float(name) { return this._col(name,'FLOAT'); }
  text(name) { return this._col(name,'TEXT'); }
  boolean(name) { return this._col(name,'BOOLEAN'); }
  timestamp(name) { return this._col(name,'TIMESTAMP'); }
  json(name) { return this._col(name,'JSON'); }
  _col(name,type) {
    const col={name,dataType:{name:type},constraints:[]};
    this._cols.push(col);
    const api={
      notNull:()=>{col.constraints.push({type:'NOT_NULL'});return api;},
      nullable:()=>api,
      unique:()=>{col.constraints.push({type:'UNIQUE'});return api;},
      primary:()=>{col.constraints.push({type:'PRIMARY_KEY'});return api;},
      default:(v)=>{col.constraints.push({type:'DEFAULT',value:{type:'LITERAL',val:v}});return api;},
      references:(t,c)=>{col.constraints.push({type:'REFERENCES',table:t,col:c});return api;},
      integer:(n)=>this.integer(n), float:(n)=>this.float(n), text:(n)=>this.text(n),
      boolean:(n)=>this.boolean(n), timestamp:(n)=>this.timestamp(n), json:(n)=>this.json(n),
      create:()=>this.create(), alter:()=>this.alter(),
    };
    return api;
  }
  create() {
    if(this.db.tables.has(this.name)) return this;
    this.db.createTable(this.name,this._cols,this._constraints);
    return this;
  }
  alter() {
    if(!this.db.tables.has(this.name)) { this.create(); return this; }
    const table=this.db.getTable(this.name);
    for(const col of this._cols) {
      if(!table.colMap.has(col.name)) { table.cols.push(col); table._buildColMap(); }
    }
    return this;
  }
}

// ─── Query Builder ────────────────────────────────────────────────────────────
export class QueryBuilder {
  constructor(db,tableName) {
    this.db=db; this._table=tableName;
    this._selects=['*']; this._wheres=[]; this._joins=[];
    this._orderBys=[]; this._limit=null; this._offset=null;
    this._groupBys=[]; this._havings=[];
  }
  select(...cols) { this._selects=cols; return this; }
  where(col,op,val) {
    if(val===undefined){val=op;op='=';}
    this._wheres.push({col,op,val}); return this;
  }
  whereRaw(sql) { this._wheres.push({raw:sql}); return this; }
  join(table,a,op,b) { this._joins.push({type:'INNER',table,a,op,b}); return this; }
  leftJoin(table,a,op,b) { this._joins.push({type:'LEFT',table,a,op,b}); return this; }
  orderBy(col,dir='ASC') { this._orderBys.push({col,dir}); return this; }
  limit(n) { this._limit=n; return this; }
  offset(n) { this._offset=n; return this; }
  groupBy(...cols) { this._groupBys=cols; return this; }
  having(raw) { this._havings.push(raw); return this; }
  toSQL() {
    let sql=`SELECT ${this._selects.join(',')} FROM ${this._table}`;
    for(const j of this._joins) sql+=` ${j.type} JOIN ${j.table} ON ${j.a}${j.op}${j.b}`;
    if(this._wheres.length) {
      const parts=this._wheres.map(w=>w.raw||`${w.col}${w.op}${typeof w.val==='string'?`'${w.val}'`:w.val}`);
      sql+=` WHERE ${parts.join(' AND ')}`;
    }
    if(this._groupBys.length) sql+=` GROUP BY ${this._groupBys.join(',')}`;
    if(this._havings.length) sql+=` HAVING ${this._havings.join(' AND ')}`;
    if(this._orderBys.length) sql+=` ORDER BY ${this._orderBys.map(o=>`${o.col} ${o.dir}`).join(',')}`;
    if(this._limit!==null) sql+=` LIMIT ${this._limit}`;
    if(this._offset!==null) sql+=` OFFSET ${this._offset}`;
    return sql;
  }
  get() { return this.db.query(this.toSQL()); }
  first() { const r=this.limit(1).get(); return r[0]||null; }
  count() { return this.select('COUNT(*) as count').first()?.count??0; }
  insert(data) {
    const cols=Object.keys(data).join(',');
    const vals=Object.values(data).map(v=>typeof v==='string'?`'${v}'`:v).join(',');
    return this.db.exec(`INSERT INTO ${this._table}(${cols}) VALUES(${vals})`);
  }
  update(data) {
    const sets=Object.entries(data).map(([k,v])=>`${k}=${typeof v==='string'?`'${v}'`:v}`).join(',');
    let sql=`UPDATE ${this._table} SET ${sets}`;
    if(this._wheres.length) {
      const parts=this._wheres.map(w=>w.raw||`${w.col}${w.op}${typeof w.val==='string'?`'${w.val}'`:w.val}`);
      sql+=` WHERE ${parts.join(' AND ')}`;
    }
    return this.db.exec(sql);
  }
  delete() {
    let sql=`DELETE FROM ${this._table}`;
    if(this._wheres.length) {
      const parts=this._wheres.map(w=>w.raw||`${w.col}${w.op}${typeof w.val==='string'?`'${w.val}'`:w.val}`);
      sql+=` WHERE ${parts.join(' AND ')}`;
    }
    return this.db.exec(sql);
  }
}

// ─── ORM Model ────────────────────────────────────────────────────────────────
export class Model {
  static _db=null;
  static _table=null;
  static _cols=[];

  static setDb(db) { this._db=db; }

  static createTable() {
    if(!this._db) throw new Error('No database set');
    if(!this._db.tables.has(this._table)) {
      this._db.createTable(this._table,this._cols);
    }
    return this;
  }

  static query() { return new QueryBuilder(this._db,this._table); }

  static find(id) {
    const rows=this.query().where('id','=',id).get();
    return rows[0]?new this(rows[0]):null;
  }

  static findBy(col,val) {
    const rows=this.query().where(col,'=',val).get();
    return rows[0]?new this(rows[0]):null;
  }

  static all() { return this.query().get().map(r=>new this(r)); }

  static where(col,op,val) { return this.query().where(col,op,val); }

  static create(attrs) {
    const m=new this(attrs);
    m.save();
    return m;
  }

  constructor(attrs={}) { Object.assign(this,attrs); }

  save() {
    const ctor=this.constructor;
    if(this.id) {
      const data={...this}; delete data.id;
      ctor.query().where('id',this.id).update(data);
    } else {
      ctor.query().insert(this);
    }
    return this;
  }

  destroy() {
    this.constructor.query().where('id',this.id).delete();
    return this;
  }

  toJSON() { return {...this}; }
}

// ─── Migration runner ─────────────────────────────────────────────────────────
export class Migrator {
  constructor(db) {
    this.db=db; this.migrations=[];
    this.db.exec(`CREATE TABLE IF NOT EXISTS __migrations(id INTEGER, name TEXT, run_at TEXT)`).catch?.(()=>{});
    if(!db.tables.has('__migrations')) db.createTable('__migrations',[
      {name:'id',dataType:{name:'INTEGER'}},
      {name:'name',dataType:{name:'TEXT'}},
      {name:'run_at',dataType:{name:'TEXT'}},
    ]);
  }
  add(name,up,down) { this.migrations.push({name,up,down}); return this; }
  async run() {
    const ran=new Set(this.db.query('SELECT name FROM __migrations').map(r=>r.name));
    for(const m of this.migrations) {
      if(!ran.has(m.name)) {
        await m.up(this.db);
        this.db.getTable('__migrations').insert({id:ran.size+1,name:m.name,run_at:new Date().toISOString()});
      }
    }
  }
  async rollback(steps=1) {
    const ran=this.db.query('SELECT name FROM __migrations ORDER BY id DESC').slice(0,steps);
    for(const r of ran) {
      const m=this.migrations.find(x=>x.name===r.name);
      if(m) { await m.down(this.db); }
      this.db.exec(`DELETE FROM __migrations WHERE name='${r.name}'`);
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export function createDatabase(name='db') { return new Database(name); }
export function schema(db) { return new SchemaBuilder(db); }
export function table(db,name) { return new QueryBuilder(db,name); }
