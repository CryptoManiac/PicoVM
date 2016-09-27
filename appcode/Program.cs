/**
 * Very, very, very simple testing program. Conditional jumps, argument access, arithmetics, etc. aren't supported yet.
 */

using System;
using System.Collections.Generic;
using System.Text;

namespace SimpleApp
{
    class Program
    {
        static void Main(string[] args)
        {
	    int[] nArr = new int[10];

	    for(int n = 0; n < nArr.Length; ++n) {
		nArr[n] = n;
	    }

	    for(int n = 0; n < nArr.Length; ++n) {
		Console.WriteLine(nArr[n]);
	    }
        }
    }
}
