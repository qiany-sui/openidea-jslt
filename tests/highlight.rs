use openidea_jslt::highlights;
use openidea_plugin::syntax::Highlight;

#[test]
fn classifies_jslt_without_splitting_dashed_names_or_comments() {
    use Highlight::*;
    let source = "let my-var = true\n{\"n\": string($my-var), \"n2\": 1.2e-3} // 中文";
    let actual: Vec<_> = highlights(source)
        .into_iter()
        .map(|t| (&source[t.range], t.kind))
        .collect();
    assert_eq!(
        actual,
        vec![
            ("let", Keyword),
            ("my-var", Variable),
            ("=", Operator),
            ("true", Atom),
            ("{", Punctuation),
            ("\"n\"", String),
            (":", Punctuation),
            ("string", FunctionCall),
            ("(", Punctuation),
            ("$my-var", Variable),
            (")", Punctuation),
            (",", Punctuation),
            ("\"n2\"", String),
            (":", Punctuation),
            ("1.2e-3", Number),
            ("}", Punctuation),
            ("// 中文", Comment),
        ]
    );
}

#[test]
fn utf8_offsets_cover_whole_strings_after_chinese_and_emoji() {
    let source = "// 中文🦊\n\"你好🦊\" + .name";
    let tokens = highlights(source);
    assert_eq!(tokens[0].range, 0..13);
    assert_eq!(tokens[1].range, 14..26);
    assert_eq!(tokens[1].kind, Highlight::String);
    assert_eq!(tokens.last().unwrap().kind, Highlight::Property);
}

#[test]
fn handles_incomplete_strings_and_every_unicode_prefix_without_panicking() {
    let text = "def f(x) // 注释\n{\"x\": \"中\\\"🦊\\";
    for end in (0..=text.len()).filter(|i| text.is_char_boundary(*i)) {
        let prefix = &text[..end];
        let tokens = highlights(prefix);
        let mut previous = 0;
        for t in tokens {
            assert!(t.range.start >= previous && t.range.end > t.range.start);
            assert!(t.range.end <= prefix.len());
            assert!(prefix.is_char_boundary(t.range.start) && prefix.is_char_boundary(t.range.end));
            previous = t.range.end;
        }
    }
    let tokens = highlights("\"unfinished\\");
    assert_eq!(tokens[0].range, 0..12);
    assert_eq!(tokens[0].kind, Highlight::String);
}

#[test]
fn distinguishes_namespace_definitions_and_property_access() {
    let source = "def twice(x) lib:twice(.value)";
    let tokens = highlights(source);
    let kind = |name| {
        tokens
            .iter()
            .find(|t| &source[t.range.clone()] == name)
            .unwrap()
            .kind
    };
    assert_eq!(kind("def"), Highlight::Keyword);
    assert_eq!(kind("twice"), Highlight::Function);
    assert_eq!(kind("lib"), Highlight::Namespace);
    assert_eq!(kind("value"), Highlight::Property);
}

#[test]
fn multiline_string_including_comment_markers_is_one_string_token() {
    let source = "\"first  \n  // 中文\nlast\"";
    let tokens = highlights(source);
    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0].kind, Highlight::String);
    assert_eq!(tokens[0].range, 0..source.len());
}
