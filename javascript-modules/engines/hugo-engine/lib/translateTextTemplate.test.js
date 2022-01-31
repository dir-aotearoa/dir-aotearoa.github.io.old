import test from 'ava';
import translateTextTemplate from './translateTextTemplate.js';

test("add live markup to bookshop tags", t => {
    const input = `{{ partial "bookshop" (slice "content" (dict "content_html" .Params.note_html "type" "note")) }}`;
    const expected = [
        `{{ \`<!--bookshop-live name(content) params(.: ((dict "content_html" .Params.note_html "type" "note")))-->\` | safeHTML }}`,
        `{{ partial "bookshop" (slice "content" (dict "content_html" .Params.note_html "type" "note")) }}`,
        `{{ \`<!--bookshop-live end-->\` | safeHTML }}`
    ].join('');
    t.is(translateTextTemplate(input, {}), expected);
});

test("add live markup to scoped bookshop tags", t => {
    const input = `{{ partial "bookshop" . }}`;
    const expected = [
        `{{ if reflect.IsSlice . }}{{ (printf \`<!--bookshop-live name(%s) params(.: .)-->\` (index . 0)) | safeHTML }}`,
        `{{- else if reflect.IsMap . -}}{{ (printf \`<!--bookshop-live name(%s) params(.: .)-->\` ._bookshop_name) | safeHTML }}{{ end }}`,
        `{{ partial "bookshop" . }}`,
        `{{ \`<!--bookshop-live end-->\` | safeHTML }}`
    ].join('');
    t.is(translateTextTemplate(input, {}), expected);
});

test("don't add live markup to bookshop_partial tags", t => {
    const input = `{{ partial "bookshop_partial" (slice "helper" (dict "text" "input")) }}`;
    const expected = `{{ partial "bookshop_partial" (slice "helper" (dict "text" "input")) }}`;
    t.is(translateTextTemplate(input, {}), expected);
});

test("add live markup to assigns", t => {
    let input = `{{ $a := .b }}`;
    let expected = `{{ $a := .b }}{{ \`<!--bookshop-live context($a: (.b))-->\` | safeHTML }}`;
    t.is(translateTextTemplate(input, {}), expected);

    input = `{{ $a := .b | chomp }}`;
    expected = `{{ $a := .b | chomp }}{{ \`<!--bookshop-live context($a: (.b | chomp))-->\` | safeHTML }}`;
    t.is(translateTextTemplate(input, {}), expected);
});

test("add live markup to withs", t => {
    const input = `{{ with .b }}<p>{{.}}</p>{{ end }}`;
    const expected = [`{{ with .b }}`,
        `{{ \`<!--bookshop-live stack-->\` | safeHTML }}`,
        `{{ \`<!--bookshop-live context(.: (.b))-->\` | safeHTML }}`,
        `<p>{{.}}</p>`,
        `{{ \`<!--bookshop-live unstack-->\` | safeHTML }}`,
        `{{ end }}`
    ].join('');
    t.is(translateTextTemplate(input, {}), expected);
});

test("add live markup to loops", t => {
    const input = `{{ range .items }}<p>{{ . }}</p>{{ end }}`;
    const expected = [`{{ $bookshop__live__iterator := 0 }}`,
        `{{ range .items }}`,
        `{{ \`<!--bookshop-live stack-->\` | safeHTML }}`,
        `{{ (printf \`<!--bookshop-live context(.: (index (.items) %d))-->\` $bookshop__live__iterator) | safeHTML }}`,
        `{{ $bookshop__live__iterator = (add $bookshop__live__iterator 1) }}`,
        `<p>{{ . }}</p>`,
        `{{ \`<!--bookshop-live unstack-->\` | safeHTML }}`,
        `{{ end }}`
    ].join('');
    t.is(translateTextTemplate(input, {}), expected);
});

test("add live markup to loops with iterators", t => {
    const input = `{{range $loop_index, $element := .columns}}<p>{{$element}}</p>{{ end }}`;
    const expected = [`{{range $loop_index, $element := .columns}}`,
        `{{ \`<!--bookshop-live stack-->\` | safeHTML }}`,
        `{{ (printf \`<!--bookshop-live context(.: (index (.columns) %d))-->\` $loop_index) | safeHTML }}`,
        `<p>{{$element}}</p>`,
        `{{ \`<!--bookshop-live unstack-->\` | safeHTML }}`,
        `{{ end }}`
    ].join('');
    t.is(translateTextTemplate(input, {}), expected);
});

test("add live markup to complex end structures", t => {
    const input = `
{{ range .items }}

    {{with .text}}
    <p>{{ . }}</p>
    {{ end }}

    {{ if .subtitle }}
        <h2>{{ .subtitle }}</h2>
    {{ else }}
        {{ with .excerpt }}
        <p>{{ . }}</p>
        {{end}}
    {{ end }}

{{ end }}`;
    const expected = `
{{ $bookshop__live__iterator := 0 }}{{ range .items }}{{ \`<!--bookshop-live stack-->\` | safeHTML }}{{ (printf \`<!--bookshop-live context(.: (index (.items) %d))-->\` $bookshop__live__iterator) | safeHTML }}{{ $bookshop__live__iterator = (add $bookshop__live__iterator 1) }}

    {{with .text}}{{ \`<!--bookshop-live stack-->\` | safeHTML }}{{ \`<!--bookshop-live context(.: (.text))-->\` | safeHTML }}
    <p>{{ . }}</p>
    {{ \`<!--bookshop-live unstack-->\` | safeHTML }}{{ end }}

    {{ if .subtitle }}
        <h2>{{ .subtitle }}</h2>
    {{ else }}
        {{ with .excerpt }}{{ \`<!--bookshop-live stack-->\` | safeHTML }}{{ \`<!--bookshop-live context(.: (.excerpt))-->\` | safeHTML }}
        <p>{{ . }}</p>
        {{ \`<!--bookshop-live unstack-->\` | safeHTML }}{{end}}
    {{ end }}

{{ \`<!--bookshop-live unstack-->\` | safeHTML }}{{ end }}`;
    t.is(translateTextTemplate(input, {}), expected);
});