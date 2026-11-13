use openidea_plugin::syntax::{Highlight, SyntaxProvider, Token};
use openidea_plugin::{Error, Invocation, Plugin, register_plugin};

#[derive(Default)]
pub struct Jslt;

impl Plugin for Jslt {
    fn run_command(
        &mut self,
        id: &str,
        _ctx: &Invocation,
        _arg: Option<&str>,
    ) -> Result<Option<String>, Error> {
        Err(Error::NotFound(format!("command {id}")))
    }
}

impl SyntaxProvider for Jslt {
    fn highlights(&mut self, _language: &str, text: &str) -> Vec<Token> {
        highlights(text)
    }
}

register_plugin!(Jslt, syntax);

fn ident(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-'
}

/// OpenIDEA 使用 UTF-8 字节偏移；每次跳过非 ASCII 文本都跨过完整字符。
pub fn highlights(text: &str) -> Vec<Token> {
    use Highlight::*;
    let bytes = text.as_bytes();
    let mut tokens: Vec<Token> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let start = i;
        let b = bytes[i];
        let kind = if b.is_ascii_whitespace() {
            i += 1;
            continue;
        } else if bytes[i..].starts_with(b"//") {
            i = text[i..].find('\n').map_or(bytes.len(), |n| i + n);
            Comment
        } else if b == b'"' {
            i += 1;
            while i < bytes.len() {
                let c = text[i..].chars().next().unwrap();
                i += c.len_utf8();
                if c == '"' {
                    break;
                }
                if c == '\\' && i < bytes.len() {
                    i += text[i..].chars().next().unwrap().len_utf8();
                }
            }
            String
        } else if b.is_ascii_digit() {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if bytes.get(i) == Some(&b'.') && bytes.get(i + 1).is_some_and(u8::is_ascii_digit) {
                i += 1;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
            }
            if matches!(bytes.get(i), Some(b'e' | b'E')) {
                let mut j = i + 1;
                if matches!(bytes.get(j), Some(b'+' | b'-')) {
                    j += 1;
                }
                if bytes.get(j).is_some_and(u8::is_ascii_digit) {
                    i = j + 1;
                    while i < bytes.len() && bytes[i].is_ascii_digit() {
                        i += 1;
                    }
                }
            }
            Number
        } else if b == b'$' || b.is_ascii_alphabetic() || b == b'_' {
            i += 1;
            while i < bytes.len() && ident(bytes[i]) {
                i += 1;
            }
            let word = &text[start..i];
            let previous = tokens
                .iter()
                .rev()
                .find(|t| t.kind != Comment)
                .map(|t| &text[t.range.clone()]);
            let next = text[i..].trim_start().as_bytes().first().copied();
            if b == b'$' {
                Variable
            } else if previous == Some(".") {
                Property
            } else if matches!(
                word,
                "def" | "let" | "if" | "else" | "for" | "import" | "as" | "and" | "or"
            ) {
                Keyword
            } else if matches!(word, "true" | "false" | "null") {
                Atom
            } else if previous == Some("def") {
                Function
            } else if next == Some(b':') {
                Namespace
            } else if next == Some(b'(') {
                FunctionCall
            } else {
                Variable
            }
        } else if b"{}[](),.:".contains(&b) {
            i += 1;
            Punctuation
        } else if b"+-*/%=!<>|".contains(&b) {
            i += 1;
            if matches!(b, b'=' | b'!' | b'<' | b'>') && bytes.get(i) == Some(&b'=') {
                i += 1;
            }
            Operator
        } else {
            i += text[i..].chars().next().unwrap().len_utf8();
            continue;
        };
        tokens.push(Token {
            range: start..i,
            kind,
        });
    }
    tokens
}
